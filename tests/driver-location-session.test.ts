import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDriverLocationSession, type DriverLocationSample } from '../src/dev/driver/locationSession.ts';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

class Timers {
  jobs = new Map<number, { delay: number; callback: () => void }>(); next = 0;
  set = ((callback: () => void, delay = 0) => { const id = ++this.next; this.jobs.set(id, { delay, callback }); return id; }) as unknown as typeof setTimeout;
  clear = ((id: number) => { this.jobs.delete(id); }) as unknown as typeof clearTimeout;
  run(delay: number) { const match = [...this.jobs].find(([, job]) => job.delay === delay); assert.ok(match); this.jobs.delete(match[0]); match[1].callback(); }
}

test('foreground watcher ignores stale last-known, sends valid samples, and stops cleanly', async () => {
  const timers = new Timers(); let callback: ((sample: DriverLocationSample) => void) | undefined; let removed = 0; let watches = 0;
  const sent: { coordinate: readonly [number, number]; heading?: number; id: string; aborted: boolean }[] = []; let ids = 0;
  const session = createDriverLocationSession({ now: () => 100_000, operationId: () => `sample-${++ids}`, setTimer: timers.set, clearTimer: timers.clear,
    location: { balancedAccuracy: 3, requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getLastKnownPositionAsync: async () => ({ timestamp: 40_000, coords: { longitude: -99, latitude: 19 } }),
      watchPositionAsync: async (_options, next) => { watches++; callback = next; return { remove: () => { removed++; } }; } },
    send: async (coordinate, heading, id, signal) => { sent.push({ coordinate, heading, id, aborted: signal.aborted }); }, onError: () => {},
  });
  await flush(); assert.equal(watches, 1); assert.equal(sent.length, 0);
  callback!({ timestamp: 100_001, coords: { longitude: -99.8, latitude: 19.8, heading: 361 } }); await flush();
  callback!({ timestamp: 100_002, coords: { longitude: -99.7, latitude: 19.7, heading: 45 } }); await flush();
  assert.deepEqual(sent.map(value => value.id), ['sample-1', 'sample-2']); assert.equal(sent[0]!.heading, undefined); assert.equal(sent[1]!.heading, 45);
  session.stop(); assert.equal(removed, 1); assert.equal(timers.jobs.size, 0);
});

test('fresh last-known uses the normal endpoint and watchdog recreates a silent watcher without an aggressive loop', async () => {
  const timers = new Timers(); let removed = 0; let watches = 0; const sent: number[] = []; const errors: string[] = [];
  const session = createDriverLocationSession({ now: () => 100_000, operationId: () => `operation-${sent.length + 1}`, setTimer: timers.set, clearTimer: timers.clear,
    location: { balancedAccuracy: 3, requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getLastKnownPositionAsync: async () => ({ timestamp: 99_999, coords: { longitude: -99, latitude: 19 } }),
      watchPositionAsync: async () => { watches++; return { remove: () => { removed++; } }; } },
    send: async coordinate => { sent.push(coordinate[0]); }, onError: value => errors.push(value),
  });
  await flush(); assert.deepEqual(sent, [-99]); assert.equal(watches, 1);
  timers.run(10_000); assert.equal(removed, 1); assert.match(errors.at(-1)!, /Reintentando/); assert.equal(watches, 1);
  timers.run(3_000); await flush(); assert.equal(watches, 2); session.stop(); assert.equal(removed, 2);
});

test('Driver screen activates one watcher only for LOCATING/AVAILABLE foreground states', () => {
  const source = readFileSync('src/dev/driver/DriverLiveScreen.tsx', 'utf8');
  assert.match(source, /availability === 'LOCATING' \|\| availability === 'AVAILABLE'/); assert.match(source, /createDriverLocationSession/);
  assert.match(source, /queryClient, tracksLocation, focused, foreground/);
  assert.doesNotMatch(source, /getCurrentPositionAsync/); assert.match(source, /return \(\) => session\.stop\(\)/);
});
