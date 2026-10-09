import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MatchingCoordinator, type MatchingClock, type MatchingOptions } from '../gateway/matching/coordinator.ts';
import { createAuthConfig, type Principal } from '../gateway/matching/auth.ts';
import { priceTrip } from '../gateway/pricing/engine.ts';
import type { AuthoritativeRideQuote } from '../src/services/pricing/contracts.ts';
import type { RouteResult } from '../src/services/geospatial/contracts.ts';
import { syntheticDraft, syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';
import type { MatchingServerEvent } from '../gateway/matching/trace.ts';
import { QueryClient } from '@tanstack/react-query';
import { createPassengerIdentity } from '../src/features/passenger/tripIdentity.ts';
import { executeConfirmedCommand, tripKey, tripQueryOptions } from '../src/features/trip/queries.ts';
import type { PassengerTrip } from '../src/features/passenger/model.ts';
import type { TripInvalidation } from '../src/services/realtime/index.ts';

// Manufacture actual legacy schema, rather than merely relabelling a v4 snapshot.
function stripV4(value: Record<string, any>) {
  delete value.pricingBases;
  const strip = (r: Record<string, unknown> | undefined) => { if (r) { delete r.pricingBasisId; delete r.lifecycle; } };
  Object.values(value.requests).forEach(r => strip(r as Record<string, unknown>));
  Object.values(value.actions).forEach(a => strip((a as { result: { request?: Record<string, unknown> } }).result.request));
  return value;
}
class Clock implements MatchingClock {
  time = 1000; jobs = new Map<symbol, { at: number; callback: () => void }>();
  now = () => this.time;
  schedule = (delay: number, callback: () => void) => { const id = Symbol(); this.jobs.set(id, { at: this.time + delay, callback }); return () => { this.jobs.delete(id); }; };
  advance(ms: number) { this.time += ms; const jobs = [...this.jobs]; for (const [id, job] of jobs) if (job.at <= this.time) { this.jobs.delete(id); job.callback(); } }
}
const flush = async () => { for (let i = 0; i < 15; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
const p: Principal = { accountId: 'p', role: 'passenger' };
const other: Principal = { accountId: 'other', role: 'passenger' };
const driver = (n: number): Principal => ({ accountId: `d${n}`, role: 'driver' });
function setup(count = 4, customEta?: MatchingOptions['eta']) {
  const directory = mkdtempSync(join(tmpdir(), 'vima-matching-test-')); const clock = new Clock();
  const tokens = Array.from({ length: count + 2 }, () => randomBytes(32).toString('hex'));
  const auth = createAuthConfig({ accounts: [p, other, ...Array.from({ length: count }, (_, i) => ({ ...driver(i + 1),
    driver: { name: `Synthetic Driver ${i + 1}`, rating: 4.5 }, vehicle: { name: 'Synthetic', plate: 'TEST', color: 'Test' } }))]
    .map((account, i) => ({ ...account, token: tokens[i] })) });
  const quotes = new Map<string, { owner: string; quote: AuthoritativeRideQuote }>();
  const addQuote = (id: string, owner = 'p') => {
    const quote: AuthoritativeRideQuote = { ...syntheticDraft, id, route: syntheticRoute, createdAt: clock.now(), expiresAt: clock.now() + 300_000,
      ...priceTrip({ config: syntheticPricing(), profile: 'URBANO', routeMetrics: syntheticRoute }), configVersion: syntheticPricing().version, profile: 'URBANO', distanceMeters: syntheticRoute.distanceMeters };
    quotes.set(id, { owner, quote }); return quote;
  };
  addQuote('quote');
  const eta: MatchingOptions['eta'] = customEta ?? (async (origin, pickup) => ({ geometry: { type: 'Feature', properties: {},
    geometry: { type: 'LineString', coordinates: [[...origin], [...pickup]] } },
    bounds: { southwest: [Math.min(origin[0], pickup[0]), Math.min(origin[1], pickup[1])], northeast: [Math.max(origin[0], pickup[0]), Math.max(origin[1], pickup[1])] },
    distanceMeters: 1000, durationSeconds: Math.abs(origin[0]) * 1000, trafficDurationSeconds: Math.abs(origin[0]) * 1000 }));
  const traces: MatchingServerEvent[] = [];
  const options = { auth, directory, clock, eta, pricingConfig: syntheticPricing(), trace: (event: MatchingServerEvent) => traces.push(event), quote: (id: string, owner: string) => {
    const entry = quotes.get(id); return entry?.owner === owner ? entry.quote : undefined;
  } };
  let coordinator = new MatchingCoordinator(options);
  return { clock, auth, tokens, directory, quotes, addQuote, traces, get c() { return coordinator; },
    ready: () => coordinator.start(),
    async available(n: number) { await coordinator.availability(driver(n), 'AVAILABLE', `available-${n}`);
      await coordinator.location(driver(n), [-n / 10, 0.1], undefined, `location-${n}`); },
    async restart() { coordinator.close(); coordinator = new MatchingCoordinator(options); await coordinator.start(); },
    close() { coordinator.close(); rmSync(directory, { recursive: true, force: true });
      for (const event of traces) if (event.event === 'availability_transition' && event.to === 'OFFLINE') assert.equal(event.reason, 'explicit_offline'); } };
}

test('identity epoch keeps real B assignment and PIN after A cancellation, late fetch/poll/bootstrap', async () => {
  const f = setup(1); const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const callbacks = new Map<string, (event: TripInvalidation) => void>();
  const identity = createPassengerIdentity(client, { subscribeTrip(id, change) { callbacks.set(id, change); return () => {}; } }, () => {});
  try {
    await f.ready(); await f.available(1); const a = await f.c.create(p, 'quote', 'A'); await flush();
    identity.adoptTripIdentity(a, 'request_receipt', identity.capture()); const fenceA = identity.capture();
    let finishFetch!: (v: PassengerTrip) => void; let finishBootstrap!: (v: PassengerTrip) => void;
    const delayedFetch = new Promise<PassengerTrip>(resolve => { finishFetch = resolve; });
    const delayedBootstrap = new Promise<PassengerTrip>(resolve => { finishBootstrap = resolve; })
      .then(snapshot => identity.adoptTripIdentity(snapshot, 'active_request_seed', fenceA));
    const gateway = { fetch: (id: string) => id === a.id ? delayedFetch : f.c.fetch(p, id),
      execute: (command: { tripId: string; commandId: string }) => f.c.cancel(p, command.tripId, command.commandId, 'user') };
    const fetchA = client.fetchQuery(tripQueryOptions(gateway, a.id, identity.context(fenceA))).catch(e => e);
    await executeConfirmedCommand(client, gateway, { tripId: a.id, commandId: 'cancel-A', name: 'cancel', payload: {} }, identity.context(fenceA));
    assert.equal(await f.c.activeRequest(p), null);
    identity.adoptTripIdentity(null, 'release_terminal', fenceA);
    f.addQuote('B-quote'); const b = await f.c.create(p, 'B-quote', 'B');
    identity.adoptTripIdentity(b, 'request_receipt', identity.capture()); await flush();
    const offer = (await f.c.driver(driver(1))).offer!; assert.equal(offer.requestId, b.id);
    await f.c.offerAction(driver(1), offer.id, 'accept', 'accept-B');
    await client.fetchQuery(tripQueryOptions(gateway, b.id, identity.context()));
    const assigned = client.getQueryData<PassengerTrip>(tripKey(b.id))!;
    assert.equal(assigned.phase, 'assigned'); assert.ok(assigned.assignment?.pin);
    callbacks.get(a.id)!({ tripId: a.id }); finishFetch(a); finishBootstrap(a); await fetchA;
    assert.equal(await delayedBootstrap, undefined);
    assert.equal(identity.capture().expectedTripId, b.id);
    assert.equal(client.getQueryData<PassengerTrip>(tripKey(b.id))?.assignment?.pin, assigned.assignment.pin);
    assert.equal((await f.c.activeRequest(p))?.id, b.id);
  } finally { identity.dispose(); client.clear(); f.close(); }
});

test('one active request per owner preserves idempotency, serializes cancel/create and releases on deadline', async () => {
  const f = setup(0); try {
    await f.ready(); assert.equal(await f.c.activeRequest(p), null);
    const a = await f.c.create(p, 'quote', 'a'); f.addQuote('q2');
    assert.equal((await f.c.create(p, 'quote', 'a')).id, a.id);
    await assert.rejects(f.c.create(p, 'q2', 'a'), /idempotency_conflict/);
    const bytes = readFileSync(join(f.directory, 'matching-v1.json'), 'utf8');
    await assert.rejects(f.c.create(p, 'q2', 'b'), /active_request_exists/);
    assert.equal(readFileSync(join(f.directory, 'matching-v1.json'), 'utf8'), bytes);
    f.addQuote('other', other.accountId); const otherTrip = await f.c.create(other, 'other', 'other');
    assert.equal((await f.c.activeRequest(other))?.id, otherTrip.id);
    await f.restart(); assert.equal((await f.c.activeRequest(p))?.id, a.id);
    const firstRace = await Promise.allSettled([f.c.create(p, 'q2', 'b'), f.c.cancel(p, a.id, 'cancel-a', 'user')]);
    assert.equal(firstRace[0]!.status, 'rejected'); assert.equal(firstRace[1]!.status, 'fulfilled');
    assert.equal(await f.c.activeRequest(p), null);
    const b = await f.c.create(p, 'q2', 'b'); assert.notEqual(b.id, a.id);
    f.addQuote('q3');
    const secondRace = await Promise.all([f.c.cancel(p, b.id, 'cancel-b', 'user'), f.c.create(p, 'q3', 'c')]);
    assert.equal((await f.c.activeRequest(p))?.id, secondRace[1].id);
    f.clock.advance(900_000); await flush(); assert.equal(await f.c.activeRequest(p), null);
    const snapshot = JSON.parse(readFileSync(join(f.directory, 'matching-v1.json'), 'utf8'));
    assert.equal(snapshot.version, 4); assert.deepEqual(snapshot.activeRequestByOwner, {});
    assert.equal(Object.keys(snapshot.requestIds).length, 4);
  } finally { f.close(); }
});

test('ASSIGNED remains active, driver cancellation preserves identity, and offer/availability traces identify committed state', async () => {
  const f = setup(1); try {
    await f.ready(); await f.available(1);
    const r = await f.c.create(p, 'quote', 'assigned-active'); await flush();
    const d = await f.c.driver(driver(1)); const o = d.offer!;
    const committed = f.traces.find(e => e.event === 'offer_commit');
    assert.ok(committed && committed.event === 'offer_commit');
    assert.equal(committed.offerId, o.id); assert.equal(committed.driverRevision, d.revision);
    assert.equal(committed.requestRevision, (await f.c.fetch(p, r.id)).revision);
    assert.ok(f.traces.some(e => e.event === 'driver_state_offer' && e.offerId === o.id));
    await f.c.offerAction(driver(1), o.id, 'accept', 'accept'); f.addQuote('second');
    await assert.rejects(f.c.create(p, 'second', 'second'), /active_request_exists/);
    await f.restart(); assert.equal((await f.c.activeRequest(p))?.phase, 'assigned');
    await f.c.cancelAssignment(driver(1), r.id, 'cancel-assignment', (await f.c.fetch(p, r.id)).assignment!.id);
    assert.equal((await f.c.activeRequest(p))?.id, r.id);
    f.clock.advance(60_000); await flush();
    assert.ok(f.traces.some(e => e.event === 'availability_transition' && e.from === 'AVAILABLE' && e.to === 'LOCATING' && e.reason === 'location_ttl'));
    await f.c.availability(driver(1), 'OFFLINE', 'availability_offline-test');
    assert.ok(f.traces.some(e => e.event === 'availability_transition' && e.to === 'OFFLINE' && e.reason === 'explicit_offline'));
    const reasons = f.traces.filter(e => e.event === 'availability_transition').map(e => e.reason);
    for (const reason of ['explicit_available', 'location_fix', 'offer_accept', 'assignment_cancel', 'location_ttl', 'explicit_offline']) assert.ok(reasons.includes(reason as typeof reasons[number]));
    assert.doesNotMatch(JSON.stringify(f.traces), /coordinate|heading|token|Authorization|Synthetic|plate|pickup|route/i);
  } finally { f.close(); }
});

test('v2 migration indexes a single active request without discarding historical records', async () => {
  const f = setup(0); try {
    await f.ready(); const r = await f.c.create(p, 'quote', 'single'); f.c.close();
    const path = join(f.directory, 'matching-v1.json'); const legacy = JSON.parse(readFileSync(path, 'utf8'));
    stripV4(legacy); legacy.version = 2; delete legacy.activeRequestByOwner; writeFileSync(path, JSON.stringify(legacy));
    await f.restart(); const next = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(next.activeRequestByOwner, { p: r.id }); assert.equal(next.version, 4);
    for (const key of ['requests', 'offers', 'drivers', 'actions', 'requestIds']) assert.deepEqual(stripV4(structuredClone(next))[key], legacy[key]);
  } finally { f.close(); }
});

for (const mode of ['oldest', 'tie', 'assigned', 'two-assigned'] as const) test(`v2 duplicate migration: ${mode}`, async () => {
  const f = setup(2); try {
    await f.ready(); await f.available(1); const a = await f.c.create(p, 'quote', 'legacy-a'); await flush();
    if (mode === 'assigned' || mode === 'two-assigned') {
      const offer = (await f.c.driver(driver(1))).offer!; await f.c.offerAction(driver(1), offer.id, 'accept', 'accept-a');
    }
    f.clock.advance(1); await f.available(2); f.addQuote('q-other', other.accountId);
    const b = await f.c.create(other, 'q-other', 'legacy-b'); await flush();
    if (mode === 'two-assigned') {
      const offer = (await f.c.driver(driver(2))).offer!; await f.c.offerAction(driver(2), offer.id, 'accept', 'accept-b');
    }
    f.c.close(); const path = join(f.directory, 'matching-v1.json'); const legacy = JSON.parse(readFileSync(path, 'utf8'));
    stripV4(legacy); legacy.version = 2; delete legacy.activeRequestByOwner;
    legacy.requests[b.id].owner = p.accountId; delete legacy.requestIds['other:legacy-b']; legacy.requestIds['p:legacy-b'] = b.id;
    if (mode === 'tie') {
      legacy.requests[b.id].createdAt = legacy.requests[a.id].createdAt;
      legacy.requests[b.id].deadline = legacy.requests[a.id].deadline;
    }
    writeFileSync(path, JSON.stringify(legacy));
    if (mode === 'two-assigned') { await assert.rejects(f.restart(), /invalid_matching_snapshot/); return; }
    await f.restart(); const next = JSON.parse(readFileSync(path, 'utf8'));
    const keep = mode === 'tie' ? [a.id, b.id].sort()[0]! : a.id;
    const discarded = keep === a.id ? b.id : a.id;
    assert.equal(next.activeRequestByOwner.p, keep); assert.equal(next.requests[discarded].state, 'CANCELLED');
    assert.equal(next.requests[discarded].revision, legacy.requests[discarded].revision + 1);
    assert.equal(Object.values(next.offers).some(o => (o as { requestId: string; state: string }).requestId === discarded && (o as { state: string }).state === 'ACTIVE'), false);
    assert.deepEqual(next.requestIds, legacy.requestIds); assert.deepEqual(stripV4(structuredClone(next)).actions, legacy.actions);
    assert.deepEqual(next.requests[keep].assignment, legacy.requests[keep].assignment);
  } finally { f.close(); }
});

test('v3 active index rejects missing, foreign, terminal and unindexed active identities', async () => {
  for (const mode of ['missing', 'foreign', 'terminal', 'unindexed']) {
    const f = setup(0); try {
      await f.ready(); const r = await f.c.create(p, 'quote', 'active'); f.c.close();
      const path = join(f.directory, 'matching-v1.json'); const snapshot = JSON.parse(readFileSync(path, 'utf8'));
      if (mode === 'missing') snapshot.activeRequestByOwner.p = 'missing';
      if (mode === 'foreign') snapshot.activeRequestByOwner.other = r.id;
      if (mode === 'terminal') snapshot.requests[r.id].state = 'CANCELLED';
      if (mode === 'unindexed') delete snapshot.activeRequestByOwner.p;
      writeFileSync(path, JSON.stringify(snapshot)); await assert.rejects(f.restart(), /invalid_matching_snapshot/);
    } finally { f.close(); }
  }
});

test('request idempotency, ownership, frozen quote and corruption fail closed across restart', async () => {
  const f = setup(); try {
    await f.ready(); const a = await f.c.create(p, 'quote', 'create-1');
    assert.equal((await f.c.create(p, 'quote', 'create-1')).id, a.id);
    f.addQuote('different'); await assert.rejects(f.c.create(p, 'different', 'create-1'), /idempotency_conflict/);
    await assert.rejects(f.c.create(other, 'quote', 'foreign'), /quote_unavailable/);
    await assert.rejects(f.c.create(p, 'missing', 'missing'), /active_request_exists/);
    const expired = f.addQuote('expired'); expired.expiresAt = f.clock.now();
    await assert.rejects(f.c.create(p, 'expired', 'expired'), /active_request_exists/);
    f.clock.advance(300_001); await flush();
    assert.equal((await f.c.fetch(p, a.id)).quote.pricing?.status, 'priced');
    const revision = (await f.c.fetch(p, a.id)).revision;
    await f.restart(); assert.equal((await f.c.create(p, 'quote', 'create-1')).id, a.id);
    assert.equal((await f.c.fetch(p, a.id)).revision, revision);
    await assert.rejects(f.c.fetch(other, a.id), /forbidden/);
    const cancelled = await f.c.cancel(p, a.id, 'cancel-1', 'user'); await f.restart();
    assert.deepEqual(await f.c.cancel(p, a.id, 'cancel-1', 'user'), cancelled);
    await assert.rejects(f.c.cancel(p, a.id, 'cancel-1', 'edit'), /idempotency_conflict/);
    const bytes = readFileSync(join(f.directory, 'matching-v1.json'), 'utf8');
    for (const secret of f.tokens) assert.equal(bytes.includes(secret), false);
    assert.equal(bytes.includes('Synthetic Driver'), false);
    writeFileSync(join(f.directory, 'matching-v1.json'), '{broken');
    await assert.rejects(f.restart(), /invalid_matching_snapshot/);
  } finally { f.close(); }
});

test('ETA ranking offers at most two; exhausted group advances and a Driver is offered once per request', async () => {
  const f = setup(); try {
    await f.ready(); for (let n = 1; n <= 4; n++) await f.available(n);
    const r = await f.c.create(p, 'quote', 'rank'); await flush();
    const a = await f.c.driver(driver(1)); const b = await f.c.driver(driver(2));
    assert.ok(a.offer); assert.ok(b.offer); assert.equal((await f.c.driver(driver(3))).offer, undefined);
    assert.ok(a.offer.etaMinutes <= b.offer.etaMinutes);
    await f.c.offerAction(driver(1), a.offer.id, 'reject', 'reject-1'); await flush();
    assert.equal((await f.c.driver(driver(3))).offer, undefined);
    await f.c.offerAction(driver(2), b.offer.id, 'reject', 'reject-2'); await flush();
    assert.ok((await f.c.driver(driver(3))).offer); assert.ok((await f.c.driver(driver(4))).offer);
    assert.equal((await f.c.driver(driver(1))).expiryCount, 0);
    f.clock.advance(20_000); await flush();
    assert.equal((await f.c.fetch(p, r.id)).phase, 'searching');
    for (let n = 1; n <= 4; n++) assert.equal((await f.c.driver(driver(n))).offer, undefined);
  } finally { f.close(); }
});

test('no candidates waits until original deadline; 60/120 seconds do not mutate server revision', async () => {
  const f = setup(); try {
    await f.ready(); const r = await f.c.create(p, 'quote', 'no-candidates');
    f.clock.advance(60_000); assert.equal((await f.c.fetch(p, r.id)).revision, r.revision);
    f.clock.advance(60_000); assert.equal((await f.c.fetch(p, r.id)).revision, r.revision);
    f.clock.advance(780_000); await flush();
    const expired = await f.c.fetch(p, r.id); assert.equal(expired.requestState, 'NO_DRIVER_FOUND'); assert.equal(expired.phase, 'expired');
    f.clock.advance(10_000); assert.equal((await f.c.fetch(p, r.id)).revision, expired.revision);
  } finally { f.close(); }
});

test('a rejected late action still advances a group expired by that mutation before the scheduler callback', async () => {
  const f = setup(4); try {
    await f.ready(); for (let n = 1; n <= 4; n++) await f.available(n);
    await f.c.create(p, 'quote', 'late-action'); await flush();
    const offer = (await f.c.driver(driver(1))).offer!;
    f.clock.time += 20_000; // The HTTP mutation reaches the lock before the due timer callback.
    await assert.rejects(f.c.offerAction(driver(1), offer.id, 'accept', 'too-late'), /offer_inactive/);
    await flush();
    const snapshot = JSON.parse(readFileSync(join(f.directory, 'matching-v1.json'), 'utf8'));
    const active = Object.values(snapshot.offers).filter((o) => (o as { state: string }).state === 'ACTIVE') as { driverId: string }[];
    assert.deepEqual(active.map(o => o.driverId).sort(), ['d3', 'd4']);
  } finally { f.close(); }
});

test('availability and persisted fresh location wake waiting requests; stale locations stop matching', async () => {
  const f = setup(); try {
    await f.ready(); const r = await f.c.create(p, 'quote', 'waiting'); await flush();
    await f.c.availability(driver(1), 'AVAILABLE', 'available-1'); await flush();
    assert.equal((await f.c.driver(driver(1))).offer, undefined);
    await f.c.location(driver(1), [-0.1, 0.1], undefined, 'loc-1'); await flush();
    assert.equal((await f.c.driver(driver(1))).offer?.requestId, r.id);
    await f.restart(); const offer = (await f.c.driver(driver(1))).offer!;
    assert.ok(offer); f.clock.advance(20_000); await flush();
    await f.c.cancel(p, r.id, 'cancel-before-next', 'user');
    f.addQuote('next'); const next = await f.c.create(p, 'next', 'next'); await flush();
    assert.ok((await f.c.driver(driver(1))).offer);
    f.clock.advance(40_000); await flush();
    assert.equal((await f.c.driver(driver(1))).availability, 'LOCATING');
    assert.equal((await f.c.driver(driver(1))).offer, undefined);
    await f.c.location(driver(1), [-0.1, 0.1], undefined, 'loc-new'); await flush();
    await f.c.cancel(p, next.id, 'cancel-before-refresh', 'user');
    f.addQuote('after-refresh'); await f.c.create(p, 'after-refresh', 'after-refresh'); await flush();
    assert.ok((await f.c.driver(driver(1))).offer);
  } finally { f.close(); }
});

test('AVAILABLE intent bootstraps through LOCATING and exact 60 second freshness expiry', async () => {
  const f = setup(1); try {
    await f.ready(); const locating = await f.c.availability(driver(1), 'AVAILABLE', 'intent');
    assert.equal(locating.availability, 'LOCATING'); assert.equal(locating.expiryCount, 0); assert.equal(locating.location, undefined);
    const request = await f.c.create(p, 'quote', 'waiting-location'); await flush();
    assert.equal((await f.c.driver(driver(1))).offer, undefined);
    const available = await f.c.location(driver(1), [-0.1, 0.1], 90, 'first-real-sample'); await flush();
    assert.equal(available.availability, 'AVAILABLE'); assert.equal(available.revision, locating.revision + 1);
    assert.deepEqual(available.location?.coordinate, [-0.1, 0.1]);
    assert.equal(available.location?.receivedAt, f.clock.now()); assert.equal((await f.c.driver(driver(1))).offer?.requestId, request.id);
    f.clock.advance(59_999); assert.equal((await f.c.driver(driver(1))).availability, 'AVAILABLE');
    f.clock.advance(1); await flush(); const expired = await f.c.driver(driver(1));
    assert.equal(expired.availability, 'LOCATING'); assert.deepEqual(expired.location?.coordinate, [-0.1, 0.1]);
    const recovered = await f.c.location(driver(1), [-0.2, 0.2], undefined, 'fresh-again');
    assert.equal(recovered.availability, 'AVAILABLE'); assert.deepEqual(recovered.location?.coordinate, [-0.2, 0.2]);
  } finally { f.close(); }
});

test('freshness scheduler revokes an ACTIVE offer and preserves offered history', async () => {
  const f = setup(3); try {
    await f.ready(); await f.available(1); f.clock.advance(50_000);
    await f.available(2); await f.available(3);
    const request = await f.c.create(p, 'quote', 'freshness-revoke'); await flush();
    const first = (await f.c.driver(driver(1))).offer!; const second = (await f.c.driver(driver(2))).offer!;
    assert.ok(first); assert.ok(second); const before = (await f.c.fetch(p, request.id)).revision;
    f.clock.advance(10_000); await flush();
    assert.equal((await f.c.driver(driver(1))).availability, 'LOCATING');
    assert.equal((await f.c.driver(driver(1))).offer, undefined); assert.ok((await f.c.fetch(p, request.id)).revision > before);
    await f.c.offerAction(driver(2), second.id, 'reject', 'reject-survivor'); await flush();
    assert.equal((await f.c.driver(driver(1))).offer, undefined);
    assert.equal((await f.c.driver(driver(3))).offer?.requestId, request.id);
  } finally { f.close(); }
});

test('restart preserves fresh location, expires stale AVAILABLE, and assignment cancellation uses freshness', async () => {
  const fresh = setup(1); try {
    await fresh.ready(); await fresh.available(1); const stored = await fresh.c.driver(driver(1)); await fresh.restart();
    const recovered = await fresh.c.driver(driver(1)); assert.equal(recovered.availability, 'AVAILABLE'); assert.deepEqual(recovered.location, stored.location);
    const persisted = JSON.parse(readFileSync(join(fresh.directory, 'matching-v1.json'), 'utf8'));
    assert.equal(persisted.version, 4); assert.deepEqual(persisted.drivers.d1.location.coordinate, stored.location?.coordinate);
    fresh.clock.advance(60_000); await fresh.restart(); assert.equal((await fresh.c.driver(driver(1))).availability, 'LOCATING');
  } finally { fresh.close(); }
  const assigned = setup(1); try {
    await assigned.ready(); await assigned.available(1); const request = await assigned.c.create(p, 'quote', 'cancel-stale'); await flush();
    const offer = (await assigned.c.driver(driver(1))).offer!; await assigned.c.offerAction(driver(1), offer.id, 'accept', 'accept-stale');
    assigned.clock.advance(60_000); assert.equal((await assigned.c.driver(driver(1))).availability, 'ASSIGNED');
    assert.equal((await assigned.c.cancelAssignment(driver(1), request.id, 'cancel-stale', (await assigned.c.fetch(p, request.id)).assignment!.id)).availability, 'LOCATING');
  } finally { assigned.close(); }
});

test('snapshot v1 migrates AVAILABLE without location to LOCATING and preserves request idempotency', async () => {
  const f = setup(1); try {
    await f.ready(); const request = await f.c.create(p, 'quote', 'migrate-request');
    await f.c.availability(driver(1), 'AVAILABLE', 'legacy-available'); f.c.close();
    const path = join(f.directory, 'matching-v1.json'); const legacy = JSON.parse(readFileSync(path, 'utf8'));
    stripV4(legacy); legacy.version = 1; delete legacy.activeRequestByOwner; legacy.drivers.d1.availability = 'AVAILABLE';
    for (const action of Object.values(legacy.actions) as { result: { kind: string; driver?: { availability: string }; location?: unknown } }[]) {
      if (action.result.kind === 'driver' && action.result.driver) action.result.driver.availability = 'AVAILABLE';
    }
    writeFileSync(path, JSON.stringify(legacy)); await f.restart();
    assert.equal((await f.c.driver(driver(1))).availability, 'LOCATING');
    assert.equal((await f.c.create(p, 'quote', 'migrate-request')).id, request.id);
    assert.ok(f.traces.some(e => e.event === 'availability_transition' && e.from === 'AVAILABLE' && e.to === 'LOCATING' && e.reason === 'snapshot_migration'));
  } finally { f.close(); }
  const corrupt = setup(1); try {
    await corrupt.ready(); corrupt.c.close(); const path = join(corrupt.directory, 'matching-v1.json');
    const legacy = JSON.parse(readFileSync(path, 'utf8')); legacy.version = 1; delete legacy.activeRequestByOwner;
    legacy.drivers.d1.availability = 'AVAILABLE'; legacy.drivers.d1.expiryCount = 3;
    writeFileSync(path, JSON.stringify(legacy)); await assert.rejects(corrupt.restart(), /invalid_matching_snapshot/);
  } finally { corrupt.close(); }
});

test('location TTL never changes OFFLINE, PAUSED or ASSIGNED drivers', async () => {
  const offline = setup(1); try {
    await offline.ready(); await offline.available(1); await offline.c.availability(driver(1), 'OFFLINE', 'offline');
    offline.clock.advance(60_000); assert.equal((await offline.c.driver(driver(1))).availability, 'OFFLINE');
  } finally { offline.close(); }
  const assigned = setup(1); try {
    await assigned.ready(); await assigned.available(1); await assigned.c.create(p, 'quote', 'assigned-ttl'); await flush();
    const offer = (await assigned.c.driver(driver(1))).offer!; await assigned.c.offerAction(driver(1), offer.id, 'accept', 'accept-ttl');
    assigned.clock.advance(60_000); assert.equal((await assigned.c.driver(driver(1))).availability, 'ASSIGNED');
  } finally { assigned.close(); }
});

test('logical 20 second expiry, third expiry pauses durably, explicit resume alone resets counter', async () => {
  const f = setup(1); try {
    await f.ready(); await f.available(1);
    for (let i = 0; i < 3; i++) {
      f.addQuote(`q${i}`); const request = await f.c.create(p, `q${i}`, `r${i}`); await flush();
      const offer = (await f.c.driver(driver(1))).offer!; assert.ok(offer);
      assert.equal(offer.expiresAt - f.clock.now(), 20_000);
      f.clock.advance(19_999); assert.ok((await f.c.driver(driver(1))).offer);
      f.clock.advance(1); await flush(); assert.equal((await f.c.driver(driver(1))).offer, undefined);
      await f.c.cancel(p, request.id, `cancel-${i}`, 'user');
    }
    assert.equal((await f.c.driver(driver(1))).availability, 'PAUSED');
    assert.ok(f.traces.some(e => e.event === 'availability_transition' && e.to === 'PAUSED' && e.reason === 'offer_expiry_pause'));
    await f.restart();
    f.clock.advance(60_000); assert.equal((await f.c.driver(driver(1))).expiryCount, 3);
    assert.equal((await f.c.driver(driver(1))).availability, 'PAUSED');
    const resumed = await f.c.availability(driver(1), 'AVAILABLE', 'resume'); assert.equal(resumed.expiryCount, 0);
  } finally { f.close(); }
});

test('concurrent accepts commit one assignment; Passenger cancel cannot undo it; assignment survives restart', async () => {
  const f = setup(2); try {
    await f.ready(); await f.available(1); await f.available(2); const r = await f.c.create(p, 'quote', 'race'); await flush();
    const a = (await f.c.driver(driver(1))).offer!; const b = (await f.c.driver(driver(2))).offer!;
    const results = await Promise.allSettled([f.c.offerAction(driver(1), a.id, 'accept', 'accept-1'), f.c.offerAction(driver(2), b.id, 'accept', 'accept-2')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const assigned = await f.c.fetch(p, r.id); assert.equal(assigned.phase, 'assigned');
    assert.equal((await f.c.driver(driver(1))).assignment?.value.id, assigned.assignment!.id);
    assert.equal((await f.c.driver(driver(2))).offer, undefined);
    await assert.rejects(f.c.cancel(p, r.id, 'late-cancel', 'user'), /invalid_matching_input/);
    await f.restart(); assert.deepEqual((await f.c.fetch(p, r.id)).assignment, assigned.assignment);
    assert.equal((await f.c.offerAction(driver(1), a.id, 'accept', 'accept-1')).assignment?.value.id, assigned.assignment!.id);
  } finally { f.close(); }
});

test('Passenger cancel versus accept and expiration versus accept honor first valid commit', async () => {
  for (const first of ['cancel', 'accept', 'expire'] as const) {
    const f = setup(1); try {
      await f.ready(); await f.available(1); const r = await f.c.create(p, 'quote', first); await flush();
      const offer = (await f.c.driver(driver(1))).offer!;
      if (first === 'expire') { f.clock.advance(20_000); await assert.rejects(f.c.offerAction(driver(1), offer.id, 'accept', 'accept'), /offer_inactive/); }
      else {
        const accept = () => f.c.offerAction(driver(1), offer.id, 'accept', 'accept');
        const cancel = () => f.c.cancel(p, r.id, 'cancel', 'user');
        const results = await Promise.allSettled(first === 'cancel' ? [cancel(), accept()] : [accept(), cancel()]);
        assert.equal(results[0]!.status, 'fulfilled'); assert.equal(results[1]!.status, 'rejected');
        assert.equal((await f.c.fetch(p, r.id)).phase, first === 'cancel' ? 'cancelled' : 'assigned');
      }
    } finally { f.close(); }
  }
});

test('Driver cancel reuses request/deadline, restarts visual clock, excludes Driver and assigns the next group', async () => {
  const f = setup(4); try {
    await f.ready(); for (let n = 1; n <= 4; n++) await f.available(n);
    const r = await f.c.create(p, 'quote', 'reassign'); await flush();
    const offer = (await f.c.driver(driver(1))).offer!; await f.c.offerAction(driver(1), offer.id, 'accept', 'accept');
    const originalAssignmentId = (await f.c.fetch(p, r.id)).assignment!.id;
    f.clock.advance(1000); const cancelled = await f.c.cancelAssignment(driver(1), r.id, 'driver-cancel', originalAssignmentId); await flush();
    assert.equal(cancelled.availability, 'AVAILABLE');
    const next = await f.c.fetch(p, r.id); assert.equal(next.id, r.id); assert.equal(next.phase, 'reassigning');
    assert.equal(next.searchDeadlineAt, r.searchDeadlineAt); assert.equal(next.searchStartedAt, f.clock.now());
    assert.equal(next.assignment, undefined); assert.equal((await f.c.driver(driver(1))).offer, undefined);
    assert.equal((await f.c.driver(driver(2))).offer, undefined); // Revoked loser was already offered once.
    const third = (await f.c.driver(driver(3))).offer!; assert.ok(third);
    await f.c.offerAction(driver(3), third.id, 'accept', 'accept-third');
    assert.equal((await f.c.fetch(p, r.id)).assignment?.driver.name, 'Synthetic Driver 3');
    await f.restart(); assert.deepEqual(await f.c.cancelAssignment(driver(1), r.id, 'driver-cancel', originalAssignmentId), cancelled);
  } finally { f.close(); }
});

test('slow ETA never holds commit lock; changed location invalidates stale result', async () => {
  let release!: (route: RouteResult) => void; const gate = new Promise<RouteResult>(resolve => { release = resolve; });
  const f = setup(1, async () => gate); try {
    await f.ready(); await f.available(1); const r = await f.c.create(p, 'quote', 'slow'); await flush();
    const changed = await f.c.location(driver(1), [-0.2, 0.1], 90, 'changed-location'); assert.ok(changed.revision > 0);
    // An unrelated commit and a request cancellation complete while ETA is unresolved.
    f.addQuote('other', other.accountId); const second = await f.c.create(other, 'other', 'other');
    assert.equal((await f.c.cancel(p, r.id, 'cancel-slow', 'user')).phase, 'cancelled');
    release(syntheticRoute); await flush();
    const offer = (await f.c.driver(driver(1))).offer;
    assert.notEqual(offer?.requestId, r.id);
    if (offer) assert.equal(offer.requestId, second.id);
  } finally { f.close(); }
});

test('another request can match while a first ETA is pending; stale location ETA is discarded', async () => {
  let release!: (route: RouteResult) => void; const gate = new Promise<RouteResult>(resolve => { release = resolve; });
  const f = setup(1, async (_origin, pickup) => pickup[0] === 0.2 ? gate : syntheticRoute);
  try {
    await f.ready(); await f.available(1); const first = await f.c.create(p, 'quote', 'slow-first'); await flush();
    const q = f.addQuote('fast-quote', other.accountId); q.origin = { ...q.origin, coordinate: [0.3, 0.3] };
    const second = await f.c.create(other, 'fast-quote', 'fast-second'); await flush();
    assert.equal((await f.c.driver(driver(1))).offer?.requestId, second.id);
    release(syntheticRoute); await flush();
    assert.equal((await f.c.driver(driver(1))).offer?.requestId, second.id);
    assert.equal((await f.c.fetch(p, first.id)).phase, 'searching');
  } finally { f.close(); }
});

test('location change during ETA re-plans from new sample; cancellation excludes only the original request', async () => {
  let release!: (route: RouteResult) => void; let calls = 0;
  const gate = new Promise<RouteResult>(resolve => { release = resolve; });
  const f = setup(1, async () => ++calls === 1 ? gate : syntheticRoute);
  try {
    await f.ready(); await f.available(1); const first = await f.c.create(p, 'quote', 'changed'); await flush();
    await f.c.location(driver(1), [-0.4, 0.1], 45, 'new-sample'); release(syntheticRoute); await flush();
    const offer = (await f.c.driver(driver(1))).offer!; assert.ok(offer); assert.equal(calls, 2);
    const accepted = await f.c.offerAction(driver(1), offer.id, 'accept', 'accept');
    assert.deepEqual(accepted.assignment?.value.sample.coordinate, [-0.4, 0.1]);
    await f.c.cancelAssignment(driver(1), first.id, 'cancel-driver', (await f.c.fetch(p, first.id)).assignment!.id);
    f.addQuote('another', other.accountId); const second = await f.c.create(other, 'another', 'another'); await flush();
    assert.equal((await f.c.driver(driver(1))).offer?.requestId, second.id);
    assert.equal((await f.c.fetch(p, first.id)).phase, 'reassigning');
  } finally { f.close(); }
});

test('concurrent requests share no ACTIVE Driver and restart processes expired offers before serving', async () => {
  const f = setup(2); try {
    await f.ready(); await f.available(1); await f.available(2); f.addQuote('q2', other.accountId);
    await Promise.all([f.c.create(p, 'quote', 'r1'), f.c.create(other, 'q2', 'r2')]); await flush();
    const offers = [(await f.c.driver(driver(1))).offer, (await f.c.driver(driver(2))).offer].filter(Boolean);
    assert.equal(offers.length, 2); assert.equal(new Set(offers.map(o => o!.id)).size, 2);
    f.c.close(); f.clock.time += 20_000; await f.restart();
    assert.equal((await f.c.driver(driver(1))).offer, undefined); assert.equal((await f.c.driver(driver(1))).expiryCount, 1);
  } finally { f.close(); }
});

test('revision long-poll supports immediate/change/timeout/abort with no event queue across restart', async () => {
  const f = setup(1); try {
    await f.ready(); const r = await f.c.create(p, 'quote', 'poll');
    assert.equal((await f.c.wait(p, r.id, 0)).revision, r.revision);
    const wait = f.c.wait(p, r.id, r.revision); await flush();
    const cancelled = await f.c.cancel(p, r.id, 'cancel', 'user'); assert.equal((await wait).revision, cancelled.revision);
    const timeout = f.c.wait(driver(1), undefined, 0); await flush(); f.clock.advance(25_000); assert.equal((await timeout).revision, 0);
    const controller = new AbortController(); const abort = f.c.wait(p, r.id, cancelled.revision, controller.signal);
    const rejected = assert.rejects(abort, /cancelled/); await flush(); controller.abort(); await rejected;
    await f.restart(); assert.equal((await f.c.wait(p, r.id, r.revision)).revision, cancelled.revision);
    await assert.rejects(f.c.wait(other, r.id, 0), /forbidden/);
  } finally { f.close(); }
});
