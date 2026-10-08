import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import React from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import { QueryClient } from '@tanstack/react-query';
import { createPassengerFixtureGateway } from '../src/dev/passenger/gateway.ts';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';
import type { PassengerGateway, PassengerTrip, RideDraft } from '../src/features/passenger/model.ts';
import type { usePassengerFlow } from '../src/features/passenger/usePassengerFlow.ts';
import { createPassengerIdentity } from '../src/features/passenger/tripIdentity.ts';
import { tripKey } from '../src/features/trip/queries.ts';
import { priceTrip } from '../gateway/pricing/engine.ts';
import { syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';
import { createMatchingClient } from '../src/services/matching/client.ts';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
const renderer = require('react-test-renderer');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const clock = { after: () => () => {}, delay: async () => {} };
const draft = { origin: fixturePlaces[0]!, destination: fixturePlaces[1]!, stops: [] };
function priced(d: RideDraft = draft) {
  const id = 'server-priced'; const now = Date.now();
  return { ...fixtureQuote(d), id, pricing: { status: 'priced' as const, quote: { ...d, id, createdAt: now, expiresAt: now + 300000,
    route: syntheticRoute, configVersion: 'SYNTHETIC_PRICING_TEST_ONLY', profile: 'URBANO' as const, distanceMeters: syntheticRoute.distanceMeters,
    ...priceTrip({ config: syntheticPricing(), profile: 'URBANO', routeMetrics: syntheticRoute }) } } };
}
async function probe(gateway: PassengerGateway) {
  const h = createHarness(); const useFlow: typeof usePassengerFlow = h.load('src/features/passenger/usePassengerFlow.ts').usePassengerFlow;
  let current!: ReturnType<typeof usePassengerFlow>; let tree!: ReactTestRenderer;
  function Probe() { current = useFlow(gateway); return null; }
  const settle = async () => { for (let i = 0; i < 4; i++) await h.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
  await h.act(async () => { tree = renderer.create(React.createElement(h.QueryClientProvider, { client: h.client }, React.createElement(Probe))); });
  await settle();
  return { h, settle, flow: () => current, close: async () => { await h.act(async () => tree.unmount()); h.client.clear(); } };
}

test('live bootstrap blocks create until resolved and hydrates the original identity after restart', async () => {
  const f = createPassengerFixtureGateway(clock); const active = await f.gateway.request(priced(), 'persisted-request');
  let deliver!: (trip: PassengerTrip | null) => void; let creates = 0;
  const p = await probe({ ...f.gateway, source: 'server', paymentReady: true, tripRequestAvailable: true,
    quote: async d => priced(d), activeRequest: () => new Promise(resolve => { deliver = resolve; }),
    request: async (q, id) => { creates++; return f.gateway.request(q, id); } });
  try {
    await p.h.act(async () => p.flow().choosePlace(draft.destination)); await p.settle();
    assert.equal(p.flow().canSubmit, false); await p.h.act(async () => p.flow().submit()); assert.equal(creates, 0);
    await p.h.act(async () => deliver(active)); await p.settle();
    assert.equal(p.flow().trip?.id, active.id); assert.equal(p.flow().phase, 'searching');
    assert.equal(p.h.client.getQueryData(tripKey(active.id)).id, active.id); assert.equal(creates, 0);
  } finally { await p.close(); f.controls.dispose(); }
});

test('null bootstrap unlocks create; 409 adopts authoritative request without another POST or new identity', async () => {
  const f = createPassengerFixtureGateway(clock); let active: PassengerTrip | null = null; let reads = 0; const ids: string[] = [];
  let conflict!: Error;
  const p = await probe({ ...f.gateway, source: 'server', paymentReady: true, tripRequestAvailable: true,
    quote: async d => priced(d), activeRequest: async () => { reads++; return active; },
    request: async (_q, id) => { ids.push(id); throw conflict; } });
  conflict = new (p.h.load('src/services/api/client.ts').ApiError)(409, 'active_request_exists');
  try {
    await p.h.act(async () => p.flow().choosePlace(draft.destination)); await p.settle(); assert.equal(p.flow().canSubmit, true);
    active = await f.gateway.request(priced(), 'other-device-intent');
    await p.h.act(async () => p.flow().submit()); await p.settle();
    assert.equal(ids.length, 1); assert.equal(reads, 2); assert.equal(p.flow().trip?.id, active.id);
    assert.equal(p.flow().phase, 'searching'); assert.equal(p.flow().error, null);
    await p.h.act(async () => p.flow().submit()); assert.equal(ids.length, 1);
  } finally { await p.close(); f.controls.dispose(); }
});

test('reconnect with no local id discovers active request; known request uses normal reconciliation', async () => {
  const f = createPassengerFixtureGateway(clock); let active: PassengerTrip | null = null; let reads = 0;
  const p = await probe({ ...f.gateway, source: 'server', activeRequest: async () => { reads++; return active; } });
  try {
    assert.equal(reads, 1); assert.equal(p.flow().trip, undefined);
    active = await f.gateway.request(fixtureQuote(draft), 'reconnected-request');
    await p.h.act(async () => f.controls.setConnection('offline')); await p.h.act(async () => f.controls.setConnection('online')); await p.settle();
    assert.equal(p.flow().trip?.id, active.id); const atHydration = reads;
    await p.h.act(async () => f.controls.setConnection('offline')); await p.h.act(async () => f.controls.setConnection('online')); await p.settle();
    assert.equal(reads, atHydration); assert.equal(p.flow().trip?.id, active.id);
  } finally { await p.close(); f.controls.dispose(); }
});

test('active identity hydration rejects cross-trip merging and null never erases a nonterminal trip', () => {
  const client = new QueryClient(); const a: PassengerTrip = { id: 'a', revision: 2, phase: 'searching', quote: fixtureQuote(draft) };
  const b = { ...a, id: 'b' };
  const identity = createPassengerIdentity(client, { subscribeTrip: () => () => {} }, () => {});
  const seedActiveRequest = (_client: QueryClient, _id: string | undefined, incoming: PassengerTrip | null) =>
    identity.adoptTripIdentity(incoming, 'active_request_seed', identity.capture());
  seedActiveRequest(client, undefined, a);
  assert.equal(seedActiveRequest(client, 'a', null), null); assert.deepEqual(client.getQueryData(tripKey('a')), a);
  assert.throws(() => seedActiveRequest(client, 'a', b), /identity_violation/); assert.equal(client.getQueryData(tripKey('b')), undefined);
  const terminal = { ...a, revision: 3, phase: 'cancelled' }; client.setQueryData(tripKey('a'), terminal);
  assert.equal(seedActiveRequest(client, 'a', b)?.id, 'b'); assert.deepEqual(client.getQueryData(tripKey('a')), terminal);
  assert.equal(seedActiveRequest(client, 'b', { ...b, revision: 1 })?.revision, 2); identity.dispose(); client.clear();
});

test('confirmed cancellation permits a fresh Passenger create with a new intent id', async () => {
  const f = createPassengerFixtureGateway(clock); const ids: string[] = [];
  const p = await probe({ ...f.gateway, source: 'server', paymentReady: true, tripRequestAvailable: true,
    activeRequest: async () => null, quote: async d => priced(d),
    request: async (q, id) => { ids.push(id); return f.gateway.request(q, id); } });
  try {
    await p.h.act(async () => p.flow().choosePlace(draft.destination)); await p.settle();
    await p.h.act(async () => p.flow().submit()); await p.settle(); const first = p.flow().trip!;
    assert.equal(first.phase, 'searching');
    await p.h.act(async () => p.flow().act('cancel')); await p.settle();
    assert.equal(p.flow().trip?.phase, 'cancelled');
    await p.h.act(async () => p.flow().returnHome());
    await p.h.act(async () => p.flow().choosePlace(draft.destination)); await p.settle();
    await p.h.act(async () => p.flow().submit()); await p.settle();
    assert.equal(ids.length, 2); assert.notEqual(ids[0], ids[1]); assert.notEqual(p.flow().trip?.id, first.id);
    assert.equal(p.flow().trip?.phase, 'searching');
  } finally { await p.close(); f.controls.dispose(); }
});

test('active client decodes snapshots with frozen pricing and rejects terminal requests', async () => {
  const value = { id: 'active', revision: 1, phase: 'searching', quote: priced(), requestState: 'SEARCHING', searchStartedAt: Date.now(), searchDeadlineAt: Date.now() + 900000 };
  let raw: unknown = value;
  const client = createMatchingClient({ async request(input) { return input.decode(raw); } });
  assert.equal((await client.activeRequest())?.id, 'active');
  raw = { ...value, phase: 'cancelled', requestState: 'CANCELLED' }; await assert.rejects(client.activeRequest(), /invalid_active_request/);
});

test('visible Driver offer keeps all critical content outside scrolling and does not trace countdown ticks', async () => {
  const h = createHarness(); const Offer = h.load('src/features/driver/DriverOffer.tsx').DriverOffer;
  const events: unknown[] = []; let accepted = 0; let rejected = 0;
  const props = { offer: { id: 'o', requestId: 'r', expiresAt: 20000, pickup: draft.origin, etaMinutes: 3 }, revision: 4, now: 1000,
    disabled: false, trace: (event: string, fields: unknown) => events.push({ event, fields }), onAccept: () => accepted++, onReject: () => rejected++ };
  let tree!: ReactTestRenderer;
  await h.act(async () => { tree = renderer.create(React.createElement(Offer, props)); });
  try {
    assert.equal(tree.root.findAll(node => String(node.type) === 'ScrollView').length, 0);
    const buttons = tree.root.findAll(node => String(node.type) === 'Pressable'); assert.equal(buttons.length, 2);
    await h.act(async () => { buttons[0]!.props.onPress(); buttons[1]!.props.onPress(); }); assert.equal(accepted, 1); assert.equal(rejected, 1);
    for (const now of [2000, 3000, 4000]) await h.act(async () => tree.update(React.createElement(Offer, { ...props, now })));
    assert.equal(events.length, 1); assert.deepEqual(events[0], { event: 'offer_render', fields: { offerId: 'o', requestId: 'r', revision: 4, expiresAt: 20000 } });
    await h.act(async () => tree.update(React.createElement(Offer, { ...props, revision: 5, now: 20000 })));
    assert.equal(events.length, 2); assert.ok(tree.root.findAll(node => String(node.type) === 'Pressable').every(button => button.props.disabled));
    const screen = readFileSync('src/dev/driver/DriverLiveScreen.tsx', 'utf8');
    assert.match(screen, /renderPhase=\{\(\) => offer \?\s*<DriverOffer/);
    assert.match(screen, /\/>\s*: <DriverStatePanel/);
  } finally { await h.act(async () => tree.unmount()); h.client.clear(); }
});
