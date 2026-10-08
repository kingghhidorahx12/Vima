import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDriverLocationSession, type DriverLocationSample } from '../src/dev/driver/locationSession.ts';
import type { MatchingTraceEvent, MatchingTraceFields } from '../src/services/matching/devTrace.ts';

const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const receipt = { availability: 'AVAILABLE', revision: 2 };

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

class Timers {
  jobs = new Map<number, { delay: number; callback: () => void }>(); next = 0;
  set = ((callback: () => void, delay = 0) => { const id = ++this.next; this.jobs.set(id, { delay, callback }); return id; }) as unknown as typeof setTimeout;
  clear = ((id: number) => { this.jobs.delete(id); }) as unknown as typeof clearTimeout;
  run(delay: number) { const match = [...this.jobs].find(([, job]) => job.delay === delay); assert.ok(match); this.jobs.delete(match[0]); match[1].callback(); }
  count(delay: number) { return [...this.jobs.values()].filter(job => job.delay === delay).length; }
}

test('permission denial remains LOCATING without provider, watcher, or location POST', async () => {
  let providers = 0; let watches = 0; let sends = 0; const errors: string[] = [];
  createDriverLocationSession({ locationSessionId: 'denied', operationId: () => 'operation',
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: false }),
      requestForegroundPermissionsAsync: async () => ({ granted: false }),
      getProviderStatusAsync: async () => { providers++; return { locationServicesEnabled: true }; },
      getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async () => { watches++; return { remove() {} }; } },
    send: async () => { sends++; return receipt; }, onError: value => errors.push(value),
  });
  await flush(); assert.deepEqual({ providers, watches, sends }, { providers: 0, watches: 0, sends: 0 });
  assert.match(errors[0]!, /Se necesita ubicación/);
});

test('existing permission skips the prompt and completes provider to watcher to AVAILABLE receipt', async () => {
  let requests = 0; let providerChecks = 0; let callback: ((sample: DriverLocationSample) => void) | undefined;
  const traces: { event: MatchingTraceEvent; fields?: MatchingTraceFields }[] = [];
  const session = createDriverLocationSession({ locationSessionId: 'existing', operationId: () => 'operation',
    trace: (event, fields) => traces.push({ event, fields }),
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => { requests++; return { granted: true }; },
      getProviderStatusAsync: async () => { providerChecks++; return { locationServicesEnabled: true, gpsAvailable: true }; },
      getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async (_options, next) => { callback = next; return { remove() {} }; } },
    send: async () => receipt, onError: () => {},
  });
  await flush(); assert.equal(requests, 0); assert.equal(providerChecks, 1); assert.ok(callback);
  callback!({ timestamp: 1, coords: { longitude: -99.8, latitude: 19.8 } }); await flush();
  assert.deepEqual(traces.filter(value => ['location_session_start', 'permission_check', 'permission_result',
    'provider_result', 'watch_attached', 'watch_callback', 'location_post_receipt'].includes(value.event)).map(value => value.event),
  ['location_session_start', 'permission_check', 'permission_result', 'provider_result', 'watch_attached', 'watch_callback', 'location_post_receipt']);
  session.stop('unmount');
});

test('permission prompt AppState transitions preserve one logical session and resume one watcher on foreground', async () => {
  const prompt = deferred<{ granted: boolean }>(); let requests = 0; let watches = 0; let removed = 0;
  const promptStates: boolean[] = []; const traces: { event: MatchingTraceEvent; fields?: MatchingTraceFields }[] = [];
  const session = createDriverLocationSession({ locationSessionId: 'prompt-session', foreground: true, operationId: () => 'operation',
    trace: (event, fields) => traces.push({ event, fields }), onPermissionPromptChange: active => promptStates.push(active),
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: false }),
      requestForegroundPermissionsAsync: async () => { requests++; return prompt.promise; },
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, networkAvailable: true }),
      getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async () => { watches++; return { remove: () => { removed++; } }; } },
    send: async () => receipt, onError: () => {},
  });
  await flush(); assert.equal(requests, 1); assert.deepEqual(promptStates, [true]);
  session.setForeground(false); prompt.resolve({ granted: true }); await flush();
  assert.equal(watches, 0); assert.deepEqual(promptStates, [true]);
  assert.equal(traces.filter(value => value.event === 'location_session_start').length, 1);
  assert.equal(traces.filter(value => value.event === 'location_session_stop').length, 0);
  session.setForeground(true); await flush();
  assert.equal(watches, 1); assert.deepEqual(promptStates, [true, false]);
  session.setForeground(false); assert.equal(removed, 1);
  session.setForeground(true); await flush(); assert.equal(watches, 2);
  assert.equal(traces.filter(value => value.event === 'location_gate' && value.fields?.reason === 'permission_prompt').length, 2);
  assert.equal(traces.filter(value => value.event === 'location_gate' && value.fields?.reason === 'tracking_allowed').length, 2);
  session.stop('unfocused');
  assert.equal(traces.findLast(value => value.event === 'location_session_stop')?.fields?.reason, 'unfocused');
});

test('foreground return during a stale native attach still produces exactly one replacement watcher', async () => {
  const first = deferred<{ remove(): void }>(); let watches = 0; let removed = 0;
  const session = createDriverLocationSession({ locationSessionId: 'attach-race', operationId: () => 'operation',
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, gpsAvailable: true }),
      getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async () => {
        watches++; return watches === 1 ? first.promise : { remove: () => { removed++; } };
      } }, send: async () => receipt, onError: () => {},
  });
  await flush(); assert.equal(watches, 1);
  session.setForeground(false); session.setForeground(true); first.resolve({ remove: () => { removed++; } }); await flush();
  assert.equal(removed, 1); assert.equal(watches, 2);
  session.stop(); assert.equal(removed, 2);
});

test('disabled provider sends no location and retries through the same controlled path', async () => {
  const timers = new Timers(); let enabled = false; let providers = 0; let lastKnown = 0; let watches = 0; const errors: string[] = [];
  const session = createDriverLocationSession({ locationSessionId: 'provider', operationId: () => 'operation', setTimer: timers.set, clearTimer: timers.clear,
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => { providers++; return { locationServicesEnabled: enabled, gpsAvailable: enabled, networkAvailable: false }; },
      getLastKnownPositionAsync: async () => { lastKnown++; return null; },
      watchPositionAsync: async () => { watches++; return { remove() {} }; } },
    send: async () => receipt, onError: value => errors.push(value),
  });
  await flush(); assert.deepEqual({ providers, lastKnown, watches }, { providers: 1, lastKnown: 0, watches: 0 });
  assert.equal(timers.count(3_000), 1); assert.match(errors[0]!, /Activa los servicios/);
  enabled = true; timers.run(3_000); await flush();
  assert.deepEqual({ providers, lastKnown, watches }, { providers: 2, lastKnown: 1, watches: 1 }); session.stop();
});

test('stale last-known is ignored and each valid callback produces one sanitized POST chain', async () => {
  const timers = new Timers(); let callback: ((sample: DriverLocationSample) => void) | undefined; let removed = 0; let watches = 0;
  const sent: { coordinate: readonly [number, number]; heading?: number; id: string; aborted: boolean }[] = []; let ids = 0;
  const traces: { event: MatchingTraceEvent; fields?: MatchingTraceFields }[] = [];
  const session = createDriverLocationSession({ locationSessionId: 'stale', now: () => 100_000, operationId: () => `sample-${++ids}`,
    setTimer: timers.set, clearTimer: timers.clear, trace: (event, fields) => traces.push({ event, fields }),
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, gpsAvailable: true }),
      getLastKnownPositionAsync: async () => ({ timestamp: 40_000, coords: { longitude: -99, latitude: 19 } }),
      watchPositionAsync: async (_options, next) => { watches++; callback = next; return { remove: () => { removed++; } }; } },
    send: async (coordinate, heading, id, signal) => { sent.push({ coordinate, heading, id, aborted: signal.aborted }); return receipt; }, onError: () => {},
  });
  await flush(); assert.equal(watches, 1); assert.equal(sent.length, 0);
  callback!({ timestamp: 100_001, coords: { longitude: -99.8, latitude: 19.8, heading: 361 } }); await flush();
  callback!({ timestamp: 100_002, coords: { longitude: -99.7, latitude: 19.7, heading: 45 } }); await flush();
  assert.deepEqual(sent.map(value => value.id), ['sample-1', 'sample-2']); assert.equal(sent[0]!.heading, undefined); assert.equal(sent[1]!.heading, 45);
  assert.equal(traces.filter(value => value.event === 'watch_callback').length, 2);
  assert.equal(traces.filter(value => value.event === 'location_post_start').length, 2);
  assert.equal(traces.filter(value => value.event === 'location_post_receipt').length, 2);
  const serialized = JSON.stringify(traces); assert.doesNotMatch(serialized, /coordinate|longitude|latitude|heading|token|authorization/i);
  session.stop(); assert.equal(removed, 1); assert.equal(timers.jobs.size, 0);
});

test('fresh last-known posts once and watchdog recreates one silent watcher', async () => {
  const timers = new Timers(); let removed = 0; let watches = 0; const sent: number[] = []; const errors: string[] = [];
  const session = createDriverLocationSession({ locationSessionId: 'watchdog', now: () => 100_000, operationId: () => `operation-${sent.length + 1}`,
    setTimer: timers.set, clearTimer: timers.clear,
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, networkAvailable: true }),
      getLastKnownPositionAsync: async () => ({ timestamp: 99_999, coords: { longitude: -99, latitude: 19 } }),
      watchPositionAsync: async () => { watches++; return { remove: () => { removed++; } }; } },
    send: async coordinate => { sent.push(coordinate[0]); return receipt; }, onError: value => errors.push(value),
  });
  await flush(); assert.deepEqual(sent, [-99]); assert.equal(watches, 1); assert.equal(timers.count(10_000), 1);
  timers.run(10_000); assert.equal(removed, 1); assert.match(errors.at(-1)!, /Reintentando/); assert.equal(timers.count(3_000), 1);
  timers.run(3_000); await flush(); assert.equal(watches, 2); assert.equal(timers.count(10_000), 1);
  session.stop(); assert.equal(removed, 2);
});

test('watch error handler removes once and one retry cannot create duplicate watchers', async () => {
  const timers = new Timers(); let watches = 0; let removed = 0; const errors: ((reason: string) => void)[] = [];
  const session = createDriverLocationSession({ locationSessionId: 'watch-error', operationId: () => 'operation', setTimer: timers.set, clearTimer: timers.clear,
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, gpsAvailable: true }), getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async (_options, _next, onError) => { watches++; errors.push(onError); return { remove: () => { removed++; } }; } },
    send: async () => receipt, onError: () => {},
  });
  await flush(); assert.equal(watches, 1); errors[0]!('raw provider detail'); errors[0]!('duplicate'); await flush();
  assert.equal(removed, 1); assert.equal(timers.count(3_000), 1);
  timers.run(3_000); await flush(); assert.equal(watches, 2); assert.equal(timers.count(3_000), 0); session.stop(); assert.equal(removed, 2);
});

test('an obsolete watcher error cannot remove the replacement subscription', async () => {
  const timers = new Timers(); let watches = 0; let removed = 0; const errors: ((reason: string) => void)[] = [];
  const session = createDriverLocationSession({ locationSessionId: 'stale-error', operationId: () => 'operation', setTimer: timers.set, clearTimer: timers.clear,
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, gpsAvailable: true }), getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async (_options, _next, onError) => { watches++; errors.push(onError); return { remove: () => { removed++; } }; } },
    send: async () => receipt, onError: () => {},
  });
  await flush(); errors[0]!('first'); timers.run(3_000); await flush(); assert.equal(watches, 2); assert.equal(removed, 1);
  errors[0]!('late stale error'); await flush(); assert.equal(removed, 1); session.stop(); assert.equal(removed, 2);
});

test('an error before attach resolves cannot lose its controlled retry', async () => {
  const timers = new Timers(); let watches = 0; let resolveWatch: ((value: { remove(): void }) => void) | undefined;
  const session = createDriverLocationSession({ locationSessionId: 'early-error', operationId: () => 'operation', setTimer: timers.set, clearTimer: timers.clear,
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, gpsAvailable: true }), getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async (_options, _next, onError) => {
        watches++; if (watches > 1) return { remove() {} }; onError('early'); return await new Promise(resolve => { resolveWatch = resolve; });
      } }, send: async () => receipt, onError: () => {},
  });
  await flush(); assert.equal(timers.count(3_000), 0); resolveWatch!({ remove() {} }); await flush(); assert.equal(timers.count(3_000), 1);
  timers.run(3_000); await flush(); assert.equal(watches, 2); session.stop();
});

test('stop aborts watcher and timers, and a late callback cannot POST', async () => {
  const timers = new Timers(); let callback: ((sample: DriverLocationSample) => void) | undefined; let sends = 0; let removed = 0;
  const session = createDriverLocationSession({ locationSessionId: 'stop', operationId: () => 'operation', setTimer: timers.set, clearTimer: timers.clear,
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, gpsAvailable: true }), getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async (_options, next) => { callback = next; return { remove: () => { removed++; } }; } },
    send: async () => { sends++; return receipt; }, onError: () => {},
  });
  await flush(); session.stop(); callback!({ timestamp: Date.now(), coords: { longitude: -99, latitude: 19 } }); await flush();
  assert.equal(sends, 0); assert.equal(removed, 1); assert.equal(timers.jobs.size, 0);
});

test('stop aborts an in-flight location POST signal', async () => {
  let callback: ((sample: DriverLocationSample) => void) | undefined; let signal: AbortSignal | undefined;
  const session = createDriverLocationSession({ locationSessionId: 'abort-post', operationId: () => 'operation',
    location: { balancedAccuracy: 3, getForegroundPermissionsAsync: async () => ({ granted: true }),
      requestForegroundPermissionsAsync: async () => ({ granted: true }),
      getProviderStatusAsync: async () => ({ locationServicesEnabled: true, gpsAvailable: true }), getLastKnownPositionAsync: async () => null,
      watchPositionAsync: async (_options, next) => { callback = next; return { remove() {} }; } },
    send: async (_coordinate, _heading, _id, currentSignal) => {
      signal = currentSignal; return await new Promise(() => {});
    }, onError: () => {},
  });
  await flush(); callback!({ timestamp: Date.now(), coords: { longitude: -99, latitude: 19 } }); await flush();
  assert.equal(signal?.aborted, false); session.stop(); assert.equal(signal?.aborted, true);
});

test('Driver screen owns one logical session across LOCATING to AVAILABLE and suppresses prompt-only poll teardown', () => {
  const source = readFileSync('src/dev/driver/DriverLiveScreen.tsx', 'utf8');
  assert.match(source, /availability === 'LOCATING' \|\| availability === 'AVAILABLE'/); assert.match(source, /createDriverLocationSession/);
  assert.match(source, /queryClient, tracksLocation, focused, reportPermissionPrompt\]/);
  assert.doesNotMatch(source, /queryClient, tracksLocation, focused, foreground/);
  assert.match(source, /foreground \|\| permissionPromptActive/); assert.match(source, /\[client, accountId, queryClient, realtimeAllowed\]/);
  assert.equal(source.match(/client\.subscribeDriver\(/g)?.length, 1); assert.equal(source.match(/createDriverLocationSession\(/g)?.length, 1);
  assert.match(source, /getForegroundPermissionsAsync: Location\.getForegroundPermissionsAsync/);
  assert.doesNotMatch(source, /getCurrentPositionAsync/); assert.match(source, /session\.stop\(reason\)/);
});

test('default structured trace is guarded by DEV and exposes no raw location fields', () => {
  const source = readFileSync('src/services/matching/devTrace.ts', 'utf8');
  assert.match(source, /typeof __DEV__ === 'undefined' \|\| !__DEV__/);
  assert.doesNotMatch(source, /coordinate|longitude|latitude|heading|authorization|bearer/i);
});
