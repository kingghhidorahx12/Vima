import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { createMatchingClient } from '../src/services/matching/client.ts';
import { TripHttpSnapshotError } from '../src/services/matching/tripHttpSnapshot.ts';
import { reconcileTripWithContext } from '../src/features/trip/reconciliation.ts';
import { tripKey, tripQueryOptions } from '../src/features/trip/queries.ts';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';
import { priceTrip } from '../gateway/pricing/engine.ts';
import { syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';
import type { MatchingTraceFields } from '../src/services/matching/devTrace.ts';

const draft = { origin: fixturePlaces[0]!, destination: fixturePlaces[1]!, stops: [] };
function validSnapshot(id = 'B') {
  const now = 1_000;
  const base = fixtureQuote(draft);
  const quote = { ...base, pricing: { status: 'priced' as const, quote: { ...draft, id: 'quote', createdAt: now,
    expiresAt: now + 300_000, route: syntheticRoute, configVersion: 'SYNTHETIC_PRICING_TEST_ONLY', profile: 'URBANO' as const,
    distanceMeters: syntheticRoute.distanceMeters, ...priceTrip({ config: syntheticPricing(), profile: 'URBANO', routeMetrics: syntheticRoute }) } } };
  return { id, revision: 1, phase: 'searching' as const, requestState: 'SEARCHING' as const, lifecycle: { completedStops: 0, incurredAdditionCodes: [] },
    searchStartedAt: now, searchDeadlineAt: now + 900_000, quote };
}

function harness(initial: unknown) {
  let raw = initial;
  const events: { event: string; fields?: MatchingTraceFields }[] = [];
  const client = createMatchingClient({ async request(input) { return input.decode(raw); } },
    { trace: (event, fields) => events.push({ event, fields }) });
  return { client, events, set(value: unknown) { raw = value; } };
}

test('fetch(B) rejects id=A at the HTTP boundary and never contaminates tripKey(B)', async () => {
  const h = harness(validSnapshot('A'));
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await assert.rejects(query.fetchQuery(tripQueryOptions(h.client, 'B', { epoch: 9, isCurrent: () => true })),
    error => error instanceof TripHttpSnapshotError && error.reason === 'id_mismatch');
  assert.equal(query.getQueryData(tripKey('B')), undefined);
  assert.deepEqual(h.events.at(-1), { event: 'trip_http_snapshot', fields: {
    origin: 'request_fetch', endpoint: 'request', expectedId: 'B', incomingId: 'A', revision: 1,
    phase: 'searching', epoch: 9, accepted: false, rejectReason: 'id_mismatch',
  } });
  assert.doesNotMatch(JSON.stringify(h.events), /quote|coordinate|address|assignment|pin|bearer|header/i);
  query.clear();
});

test('HTTP snapshot boundary classifies invalid revision, phase and remaining structure', async () => {
  const h = harness({ ...validSnapshot(), revision: -1 });
  await assert.rejects(h.client.fetch('B'), (error) => error instanceof TripHttpSnapshotError && error.reason === 'revision_invalid');
  h.set({ ...validSnapshot(), phase: '' });
  await assert.rejects(h.client.fetch('B'), (error) => error instanceof TripHttpSnapshotError && error.reason === 'phase_invalid');
  h.set({ ...validSnapshot(), requestState: 'BROKEN' });
  await assert.rejects(h.client.fetch('B'), (error) => error instanceof TripHttpSnapshotError && error.reason === 'snapshot_invalid');
  assert.deepEqual(h.events.filter(value => value.event === 'trip_http_snapshot').map(value => value.fields?.rejectReason),
    ['revision_invalid', 'phase_invalid', 'snapshot_invalid']);
});

test('valid HTTP snapshot is accepted and continues to strict trip reconciliation', async () => {
  const h = harness(validSnapshot());
  const snapshot = await h.client.fetch('B', undefined, { epoch: 4 });
  const reconciles: MatchingTraceFields[] = [];
  const reconciled = reconcileTripWithContext(undefined, snapshot, { origin: 'query_structural_sharing', expectedId: 'B', epoch: 4,
    trace: (_event, fields) => reconciles.push(fields!) });
  assert.equal(reconciled.id, 'B');
  assert.equal(h.events.at(-1)?.event, 'trip_http_snapshot');
  assert.equal(h.events.at(-1)?.fields?.accepted, true);
  assert.equal(reconciles.length, 1);
  assert.equal(reconciles[0]!.incomingId, 'B');
});

test('create requestId and /active do not invent an expected trip identity', async () => {
  const h = harness(validSnapshot('server-generated'));
  assert.equal((await h.client.request('quote', 'client-request-id', { epoch: 2 })).id, 'server-generated');
  assert.equal((await h.client.activeRequest(undefined, { epoch: 3 }))?.id, 'server-generated');
  const snapshots = h.events.filter(value => value.event === 'trip_http_snapshot');
  assert.equal(snapshots.length, 2);
  assert.ok(snapshots.every(value => value.fields?.expectedId === undefined && value.fields?.accepted === true));
});
