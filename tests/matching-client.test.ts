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
test('reconnect plus advanced revision emits one invalidation, keeps one poll, and aborts on unmount', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let polls = 0; let active = 0; let maxActive = 0; let signal: AbortSignal | undefined; let deliver: ((v: unknown) => void) | undefined;
  const events: { event: string; fields?: Readonly<Record<string, unknown>> }[] = [];
  const api: ApiClient = { async request(input) {
    polls++; active++; maxActive = Math.max(maxActive, active); signal = input.signal;
    try {
      if (polls === 1) throw new TypeError('offline');
      const result = await new Promise((resolve, reject) => { deliver = resolve; signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); });
      return input.decode(result);
    } finally { active--; }
  } };
  const client = createMatchingClient(api, { pollId: () => `poll-${polls + 1}`,
    trace: (event, fields) => events.push({ event, fields }) }); let invalidations = 0; let reconnects = 0;
  const stop = client.subscribeTrip('request', event => { assert.equal(event.tripId, 'request'); invalidations++; }, () => reconnects++);
  await flush(); assert.equal(client.getConnection(), 'offline'); assert.equal(polls, 1);
  t.mock.timers.tick(499); await flush(); assert.equal(polls, 1);
  t.mock.timers.tick(1); await flush(); assert.equal(polls, 2);
  deliver!({ revision: 7 }); await flush();
  assert.equal(reconnects, 0); assert.equal(invalidations, 1); assert.equal(client.getConnection(), 'online'); assert.equal(maxActive, 1);
  assert.equal(events.filter(value => value.event === 'poll_invalidation').length, 1); assert.equal(events.filter(value => value.event === 'poll_reconnected').length, 0);
  assert.equal(polls, 3); stop(); await flush(); assert.equal(signal?.aborted, true);
  assert.equal(events.findLast(value => value.event === 'poll_stop')?.fields?.reason, 'abort');
  t.mock.timers.tick(60_000); await flush(); assert.equal(polls, 3);
});

test('Passenger reconnect without revision reconciles once and normal revision invalidates once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let calls = 0; const pending: ((value: unknown) => void)[] = [];
  const client = createMatchingClient({ async request(input) {
    calls++; if (calls === 1) throw new TypeError('offline');
    return input.decode(await new Promise(resolve => pending.push(resolve)));
  } });
  let invalidations = 0; let reconnects = 0;
  const stop = client.subscribeTrip('passenger-request', () => invalidations++, () => reconnects++);
  await flush(); t.mock.timers.tick(500); await flush();
  pending.shift()!({ revision: 0 }); await flush();
  assert.deepEqual({ invalidations, reconnects }, { invalidations: 0, reconnects: 1 });
  pending.shift()!({ revision: 1 }); await flush();
  assert.deepEqual({ invalidations, reconnects }, { invalidations: 1, reconnects: 1 }); stop(); await flush();
});

test('Driver reconnect without revision invokes its single reconcile callback once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let calls = 0; let deliver: ((value: unknown) => void) | undefined;
  const client = createMatchingClient({ async request(input) {
    calls++; if (calls === 1) throw new TypeError('offline');
    return input.decode(await new Promise(resolve => { deliver = resolve; }));
  } });
  let reconciles = 0; const stop = client.subscribeDriver(() => reconciles++);
  await flush(); t.mock.timers.tick(500); await flush(); deliver!({ revision: 0 }); await flush();
  assert.equal(reconciles, 1); stop(); await flush();
});

test('Driver poll cleanup records its explicit lifecycle reason', async () => {
  let signal: AbortSignal | undefined; const events: { event: string; reason?: unknown }[] = [];
  const client = createMatchingClient({ async request(input) {
    signal = input.signal; return await new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } }, { trace: (event, fields) => events.push({ event, reason: fields?.reason }) });
  const stop = client.subscribeDriver(() => {}); await flush(); stop('unsubscribe_background'); await flush();
  assert.equal(signal?.aborted, true);
  assert.equal(events.findLast(value => value.event === 'poll_stop')?.reason, 'unsubscribe_background');
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
