import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';
import { passengerTrip, type PassengerTrip } from '../src/features/passenger/model.ts';
import type { AuthoritativeTrip, TripGateway } from '../src/features/trip/contracts.ts';
import { tripKey, tripQueryOptions } from '../src/features/trip/queries.ts';

const quote = fixtureQuote({ origin: fixturePlaces[0]!, destination: fixturePlaces[1]!, stops: [] });
const snapshot = (id: string, revision: number, phase: PassengerTrip['phase'] = 'searching'): PassengerTrip => ({
  id, revision, phase, quote,
  ...(phase === 'assigned' ? { assignment: {
    id: 'assignment-B', driver: { name: 'Driver', rating: 4.8 }, vehicle: { name: 'Auto', plate: 'TEST', color: 'Blanco' },
    etaMinutes: 3, pin: '1234', sample: { coordinate: [-99, 19], heading: 0, sequence: 1 },
    routeToOrigin: quote.route,
  } } : {}),
});

const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('one real QueryObserver switches terminal A to B revisions without cross-ID structural sharing', async () => {
  const a = snapshot('A', 9, 'cancelled');
  const b1 = snapshot('B', 1); const b2 = snapshot('B', 2); const b3 = snapshot('B', 3, 'assigned');
  let fetched: AuthoritativeTrip = a;
  const gateway: TripGateway = { fetch: async () => fetched, execute: async () => fetched };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  client.setQueryData(tripKey('A'), a);
  const observer = new QueryObserver<AuthoritativeTrip, Error, PassengerTrip, AuthoritativeTrip, ReturnType<typeof tripKey>>(client,
    { ...tripQueryOptions(gateway, 'A'), select: passengerTrip });
  const seen: PassengerTrip[] = []; const unsubscribe = observer.subscribe(result => { if (result.data) seen.push(result.data); });
  const offeredPreviousIds: (string | undefined)[] = [];
  const previousDev = Reflect.get(globalThis, '__DEV__'); const previousInfo = console.info; const traces: string[] = [];
  Reflect.set(globalThis, '__DEV__', true); console.info = (...args: unknown[]) => { traces.push(args.map(String).join(' ')); };
  try {
    fetched = b1; client.setQueryData(tripKey('B'), b1);
    const options = tripQueryOptions(gateway, 'B');
    const sharing = options.structuralSharing as (previous: unknown, incoming: unknown) => unknown;
    observer.setOptions({ ...options, select: passengerTrip, structuralSharing: (previous, incoming) => {
      offeredPreviousIds.push((previous as AuthoritativeTrip | undefined)?.id);
      return sharing(previous, incoming);
    } });
    await tick(); await tick();
    assert.deepEqual(client.getQueryData(tripKey('B')), b1);
    client.setQueryData(tripKey('B'), b2); client.setQueryData(tripKey('B'), b3); await tick();
    assert.ok(offeredPreviousIds.includes('A'), 'TanStack must offer the prior observer result A while selecting B');
    assert.deepEqual(client.getQueryData(tripKey('A')), a);
    assert.deepEqual(client.getQueryData(tripKey('B')), b3);
    assert.deepEqual(observer.getCurrentResult().data, b3);
    assert.equal(observer.getCurrentResult().data?.phase, 'assigned');
    assert.ok(seen.some(value => value.id === 'B' && value.revision === 1));
    assert.ok(seen.some(value => value.id === 'B' && value.revision === 2));
    assert.ok(seen.some(value => value.id === 'B' && value.revision === 3 && value.phase === 'assigned'));
    const bTraces = traces.filter(value => value.includes('trip_reconcile') && value.includes('"expectedId":"B"'));
    assert.ok(bTraces.length > 0); assert.ok(bTraces.every(value => !value.includes('"previousId":"A"')));
  } finally {
    console.info = previousInfo;
    if (previousDev === undefined) Reflect.deleteProperty(globalThis, '__DEV__'); else Reflect.set(globalThis, '__DEV__', previousDev);
    unsubscribe(); observer.destroy(); client.clear();
  }
});

test('structural sharing ignores cross-ID previous but remains fail-closed for incoming identity', () => {
  const gateway: TripGateway = { fetch: async () => snapshot('B', 1), execute: async () => snapshot('B', 1) };
  const sharing = tripQueryOptions(gateway, 'B').structuralSharing as
    (previous: AuthoritativeTrip | undefined, incoming: AuthoritativeTrip) => AuthoritativeTrip;
  const a = snapshot('A', 99, 'cancelled'); const b1 = snapshot('B', 1); const b2 = snapshot('B', 2); const b3 = snapshot('B', 3);
  assert.deepEqual(sharing(a, b1), b1);
  assert.deepEqual(sharing(b2, b1), b2);
  assert.deepEqual(sharing(b2, b3), b3);
  assert.throws(() => sharing(b2, snapshot('A', 4)));
  assert.throws(() => sharing(b2, { ...b3, id: '' }));
});
