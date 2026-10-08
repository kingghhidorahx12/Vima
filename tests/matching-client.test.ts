import assert from 'node:assert/strict';
import test from 'node:test';
import { createMatchingClient } from '../src/services/matching/client.ts';
import type { ApiClient } from '../src/services/api/client.ts';
import { projectMatchingPhase } from '../src/features/passenger/useMatchingProjection.ts';
import type { PassengerTrip } from '../src/features/passenger/model.ts';
import { reconcileTrip } from '../src/features/trip/contracts.ts';
import { readFileSync } from 'node:fs';
import { decodeDriver } from '../src/services/matching/decode.ts';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
test('live poll sends only invalidations, retries with backoff, reconnects and aborts on unmount', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let polls = 0; let signal: AbortSignal | undefined; let deliver: ((v: unknown) => void) | undefined;
  const api: ApiClient = { async request(input) {
    polls++; signal = input.signal;
    if (polls === 1) throw new TypeError('offline');
    const result = await new Promise((resolve, reject) => { deliver = resolve; signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); });
    return input.decode(result);
  } };
  const client = createMatchingClient(api); let invalidations = 0; let reconnects = 0;
  const stop = client.subscribeTrip('request', event => { assert.equal(event.tripId, 'request'); invalidations++; }, () => reconnects++);
  await flush(); assert.equal(client.getConnection(), 'offline'); assert.equal(polls, 1);
  t.mock.timers.tick(499); await flush(); assert.equal(polls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(polls, 2);
  deliver!({ revision: 7 }); await flush();
  assert.equal(reconnects, 1); assert.equal(invalidations, 1); assert.equal(client.getConnection(), 'online');
  assert.equal(polls, 3); stop(); await flush(); assert.equal(signal?.aborted, true);
  t.mock.timers.tick(60_000); await flush(); assert.equal(polls, 3);
});

test('connection recovers even before a request has an id, without an aggressive loop', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let calls = 0;
  const client = createMatchingClient({ async request(input) {
    calls++; return input.decode({ accountId: 'p', role: 'passenger', matchingAvailable: true });
  } });
  const stop = client.subscribeConnection(() => {});
  t.mock.timers.tick(4999); await flush(); assert.equal(calls, 0);
  t.mock.timers.tick(1); await flush(); assert.equal(client.getConnection(), 'online'); assert.equal(calls, 1);
  stop(); t.mock.timers.tick(60_000); await flush(); assert.equal(calls, 1);
});

test('60/120 UI projections never manufacture backend expiry/revisions, reassignment resets visual clock', () => {
  const trip = { id: 'r', revision: 3, phase: 'searching', searchStartedAt: 0, searchDeadlineAt: 900_000 } as PassengerTrip;
  assert.equal(projectMatchingPhase(trip, 'searching', 59_999), 'searching');
  assert.equal(projectMatchingPhase(trip, 'searching', 60_000), 'expanding');
  assert.equal(projectMatchingPhase(trip, 'searching', 120_000), 'prolonged');
  assert.equal(projectMatchingPhase(trip, 'searching', 900_000), 'prolonged');
  assert.equal(trip.revision, 3);
  const reassigned = { ...trip, revision: 4, phase: 'reassigning' as const, searchStartedAt: 300_000 };
  assert.equal(projectMatchingPhase(reassigned, 'reassigning', 300_000), 'reassigning');
  assert.equal(projectMatchingPhase(reassigned, 'reassigning', 360_000), 'expanding');
  assert.equal(reconcileTrip(reassigned, trip), reassigned);
});

test('DEV identity gate uses SecureStore and the mobile HTTPS bearer guard is preserved', () => {
  const gate = readFileSync('src/dev/LiveAccountGate.tsx', 'utf8');
  assert.match(gate, /credentials\.write\(value\)/); assert.match(gate, /credentials\.clear\(\)/);
  assert.match(gate, /credentials\.read/); assert.match(gate, /secureTextEntry/);
  assert.doesNotMatch(readFileSync('src/dev/passenger/PassengerLiveScreen.tsx', 'utf8'), /async \(\) => null/);
  assert.match(readFileSync('src/services/api/client.ts', 'utf8'), /localHttp && credential/);
});

test('Driver decoder accepts LOCATING with last-known location and rejects AVAILABLE without location', () => {
  const profile = { driver: { name: 'Driver', rating: 4.8 }, vehicle: { name: 'Auto', plate: 'TEST', color: 'Blanco' } };
  const locating = decodeDriver({ accountId: 'd1', revision: 1, availability: 'LOCATING', expiryCount: 0, profile,
    location: { coordinate: [-99.8, 19.8], receivedAt: 1, heading: 90 } });
  assert.equal(locating.availability, 'LOCATING');
  assert.throws(() => decodeDriver({ accountId: 'd1', revision: 1, availability: 'AVAILABLE', expiryCount: 0, profile }), /Invalid matching response/);
});
