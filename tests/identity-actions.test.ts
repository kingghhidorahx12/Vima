import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { createPassengerIdentity } from '../src/features/passenger/tripIdentity.ts';
import { requestPassengerRide } from '../src/features/passenger/requests.ts';
import { executeConfirmedCommand, tripKey, tripQueryOptions } from '../src/features/trip/queries.ts';
import { reconcileTripWithContext } from '../src/features/trip/reconciliation.ts';
import { createPassengerFixtureGateway } from '../src/dev/passenger/gateway.ts';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';
import type { PassengerTrip } from '../src/features/passenger/model.ts';
import type { TripInvalidation } from '../src/services/realtime/index.ts';
import { createDriverActions } from '../src/services/matching/driverActions.ts';
import type { DriverState } from '../src/services/matching/contracts.ts';
import { ApiError } from '../src/services/api/client.ts';
import type { MatchingTrace, MatchingTraceFields } from '../src/services/matching/devTrace.ts';

function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const quote = fixtureQuote({ origin: fixturePlaces[0]!, destination: fixturePlaces[1]!, stops: [] });

test('A cancel → B create → B assigned/PIN survives late A fetch, poll, reconnect and active bootstrap', async () => {
  const f = createPassengerFixtureGateway({ after: () => () => {}, delay: async () => {} });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const subscriptions = new Map<string, { change: (v: TripInvalidation) => void; reconnect: () => void }>();
  const order: string[] = []; const reconciles: MatchingTraceFields[] = [];
  const identity = createPassengerIdentity(client, { subscribeTrip(id, change, reconnect) {
    order.push(`start:${id}`); subscriptions.set(id, { change, reconnect }); return () => { order.push(`stop:${id}`); };
  } }, id => { order.push(`expose:${id}`); }, (_event, fields) => reconciles.push(fields!));
  const originalCancel = client.cancelQueries.bind(client);
  client.cancelQueries = (...args) => { order.push(`cancel:${JSON.stringify(args[0])}`); return originalCancel(...args); };
  const invalidations: unknown[] = [];
  const originalInvalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = (...args) => { invalidations.push(args[0]); return originalInvalidate(...args); };
  try {
    const a = await requestPassengerRide(f.gateway, quote, 'request-a');
    assert.equal(client.getQueryData(tripKey(a.id)), undefined);
    identity.adoptTripIdentity(a, 'request_receipt', identity.capture()); const epochA = identity.capture();
    const lateFetch = deferred<PassengerTrip>(); const lateBootstrap = deferred<PassengerTrip>();
    const queryA = client.fetchQuery(tripQueryOptions({ ...f.gateway, fetch: () => lateFetch.promise }, a.id, identity.context(epochA))).catch(error => error);
    const bootstrapA = lateBootstrap.promise.then(value => identity.adoptTripIdentity(value, 'active_request_seed', epochA));
    await executeConfirmedCommand(client, f.gateway, { tripId: a.id, commandId: 'cancel-a', name: 'cancel', payload: { reason: 'user' } }, identity.context(epochA));
    identity.adoptTripIdentity(null, 'release_terminal', epochA);
    assert.equal(identity.capture().epoch, epochA.epoch + 1);
    const b = await requestPassengerRide(f.gateway, quote, 'request-b');
    identity.adoptTripIdentity(b, 'request_receipt', identity.capture()); const epochB = identity.capture();
    assert.equal(epochB.epoch, epochA.epoch + 2); assert.equal(epochB.expectedTripId, b.id);
    assert.ok(order.indexOf(`stop:${a.id}`) < order.indexOf(`expose:${b.id}`));
    assert.ok(order.indexOf(`expose:${b.id}`) < order.indexOf(`start:${b.id}`));
    assert.ok(order.includes(`cancel:${JSON.stringify({ queryKey: tripKey(a.id), exact: true })}`));
    f.controls.advance('assigned'); const assigned = await f.gateway.fetch(b.id) as PassengerTrip;
    await client.fetchQuery(tripQueryOptions(f.gateway, b.id, identity.context(epochB)));
    assert.ok(assigned.assignment?.pin);
    const before = invalidations.length;
    subscriptions.get(a.id)!.change({ tripId: a.id }); subscriptions.get(a.id)!.reconnect();
    lateFetch.resolve({ ...a, revision: 999 }); lateBootstrap.resolve(a); await queryA;
    assert.equal(await bootstrapA, undefined); assert.equal(invalidations.length, before);
    assert.equal(identity.capture().expectedTripId, b.id);
    assert.equal(client.getQueryData<PassengerTrip>(tripKey(a.id))?.phase, 'cancelled');
    assert.deepEqual(client.getQueryData(tripKey(b.id)), assigned);
    assert.ok(reconciles.every(event => !event.previousId || event.previousId === event.incomingId));
    subscriptions.get(b.id)!.change({ tripId: b.id }); assert.equal(invalidations.length, before + 1);
    assert.deepEqual(invalidations.at(-1), { queryKey: tripKey(b.id), exact: true });
  } finally { identity.dispose(); client.clear(); f.controls.dispose(); }
});

test('late request/conflict adoption, commands and disposed callbacks cannot write current identity', async () => {
  const client = new QueryClient();
  const identity = createPassengerIdentity(client, { subscribeTrip: () => () => {} }, () => {});
  const initial = identity.capture(); const b: PassengerTrip = { id: 'B', revision: 2, phase: 'searching', quote };
  const receipt = deferred<PassengerTrip>();
  const command = executeConfirmedCommand(client, { fetch: async () => b, execute: () => receipt.promise },
    { tripId: 'A', commandId: 'late', name: 'cancel', payload: {} }, identity.context(initial)).catch(e => e);
  identity.adoptTripIdentity(b, 'request_receipt', initial);
  for (const origin of ['request_receipt', 'active_request_conflict_recovery'] as const)
    assert.equal(identity.adoptTripIdentity({ ...b, id: 'A' }, origin, initial), undefined);
  receipt.resolve({ ...b, id: 'A', phase: 'cancelled' }); await command;
  assert.equal(client.getQueryData(tripKey('A')), undefined);
  assert.equal(identity.capture().expectedTripId, 'B');
  const last = identity.capture(); identity.dispose();
  assert.equal(identity.adoptTripIdentity(b, 'active_request_seed', last), undefined); client.clear();
});

test('query and command reconciliation enforce their own expected ID and diagnose mismatches safely', async () => {
  const a = { id: 'A', revision: 1, phase: 'searching' }; const b = { ...a, id: 'B' };
  const fields: MatchingTraceFields[] = [];
  assert.throws(() => reconcileTripWithContext(a, b, { origin: 'request_receipt', expectedId: 'A', epoch: 7,
    trace: (_event, value) => fields.push(value!) }));
  assert.deepEqual(fields[0], { origin: 'request_receipt', previousId: 'A', incomingId: 'B', expectedId: 'A', queryKey: '["trip","A"]', epoch: 7, previousRevision: 1, incomingRevision: 1 });
  const gateway = { fetch: async () => b, execute: async () => b }; const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await assert.rejects(client.fetchQuery(tripQueryOptions(gateway, 'A')));
  await assert.rejects(executeConfirmedCommand(client, gateway, { tripId: 'A', commandId: 'c', name: 'cancel', payload: {} }));
  const sharing = tripQueryOptions(gateway, 'A').structuralSharing as (previous: unknown, next: unknown) => unknown;
  assert.throws(() => sharing(b, b)); assert.equal(client.getQueryData(tripKey('B')), undefined); client.clear();
  const flow = readFileSync('src/features/passenger/usePassengerFlow.ts', 'utf8');
  assert.doesNotMatch(flow, /seedActiveRequest|setTripId\(|connectTripRealtime|trip\.refetch\(/);
});

const driver: DriverState = { accountId: 'driver', revision: 1, availability: 'ASSIGNED', expiryCount: 0,
  profile: { driver: { name: 'Test', rating: 4 }, vehicle: { name: 'Test', plate: 'TEST', color: 'Test' } },
  assignment: { requestId: 'B', pickup: quote.origin, value: { id: 'assignment-B' } as NonNullable<DriverState['assignment']>['value'] } };
function actionHarness(run: (requestId: string, id: string) => Promise<DriverState>) {
  const events: { event: string; fields?: MatchingTraceFields }[] = []; const trace: MatchingTrace = (event, fields) => events.push({ event, fields });
  const actions = createDriverActions({ cancelAssignment: run, availability: async () => driver, offerAction: run },
    { changed() {}, received() {}, settled() {}, error() {}, now: () => 100, trace });
  actions.receive(driver); return { actions, events };
}

test('synchronous duplicate press creates one frozen cancellation and ambiguous retry preserves operation/target', async () => {
  const first = deferred<DriverState>(); const calls: string[][] = [];
  const { actions, events } = actionHarness(async (requestId, id) => { calls.push([requestId, id]); if (calls.length === 1) return first.promise; return { ...driver, revision: 2, assignment: undefined, availability: 'AVAILABLE' }; });
  const input = { kind: 'assignment_cancel' as const, requestId: 'B' };
  const result = actions.startDriverAction(input); input.requestId = 'C';
  actions.startDriverAction({ kind: 'assignment_cancel', requestId: 'B' }); actions.retryPendingDriverAction();
  assert.equal(calls.length, 1); assert.equal(calls[0]![0], 'B');
  first.reject(new TypeError('offline')); await result;
  const pending = actions.pending.current!; assert.equal(pending.intent.kind, 'assignment_cancel'); assert.ok(Object.isFrozen(pending.intent));
  await actions.retryPendingDriverAction(); assert.deepEqual(calls[0], calls[1]); assert.equal(actions.pending.current, undefined);
  assert.equal(events.filter(e => e.event === 'driver_action_press').length, 1);
  assert.equal(events.filter(e => e.event === 'driver_action_request').length, 2);
  assert.ok(events.every(e => e.fields?.operationId === calls[0]![1] && e.fields?.requestId === 'B'));
});

test('new assignment invalidates pending B and late failures/retry never cancel C', async () => {
  const fail = deferred<DriverState>(); const calls: string[] = [];
  const { actions } = actionHarness(async requestId => { calls.push(requestId); return fail.promise; });
  const started = actions.startDriverAction({ kind: 'assignment_cancel', requestId: 'B' });
  actions.receive({ ...driver, revision: 2, assignment: { ...driver.assignment!, requestId: 'C' } });
  assert.equal(actions.pending.current, undefined);
  fail.reject(new TypeError('offline')); await started; await actions.retryPendingDriverAction(); assert.deepEqual(calls, ['B']);
  assert.equal(actions.startDriverAction({ kind: 'assignment_cancel', requestId: 'B' }), undefined);
});

test('definitive 4xx drops pending; ambiguous keeps only current target; expired/replaced offers cannot retry', async () => {
  const definitive = actionHarness(async () => { throw new ApiError(409, 'forbidden'); });
  await definitive.actions.startDriverAction({ kind: 'assignment_cancel', requestId: 'B' }); assert.equal(definitive.actions.pending.current, undefined);
  let time = 0; let requests = 0;
  const actions = createDriverActions({ availability: async () => driver, cancelAssignment: async () => driver,
    offerAction: async () => { requests++; throw new TypeError('offline'); } },
  { changed() {}, received() {}, settled() {}, error() {}, now: () => time });
  const offer = { id: 'offer-B', requestId: 'B', expiresAt: 20000, pickup: quote.origin, etaMinutes: 2 };
  actions.receive({ ...driver, assignment: undefined, availability: 'AVAILABLE', offer });
  await actions.startDriverAction({ kind: 'offer_accept', offerId: offer.id, requestId: 'B' }); assert.ok(actions.pending.current);
  time = 20000; await actions.retryPendingDriverAction(); assert.equal(requests, 1); assert.equal(actions.pending.current, undefined);
  time = 1; await actions.startDriverAction({ kind: 'offer_reject', offerId: offer.id, requestId: 'B' });
  actions.receive({ ...driver, revision: 2, assignment: undefined, availability: 'AVAILABLE', offer: { ...offer, id: 'offer-C', requestId: 'C' } });
  await actions.retryPendingDriverAction(); assert.equal(requests, 2); assert.equal(actions.pending.current, undefined);
});
