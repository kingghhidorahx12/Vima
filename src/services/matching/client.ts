import type { LifecycleCommand, TripTelemetry } from './lifecycle.ts';
import { ApiError, type ApiClient, type ApiRequest } from '../api/client.ts';
import type { PassengerGateway, Connection } from '../../features/passenger/model.ts';
import type { TripCommand } from '../../features/trip/contracts.ts';
import type { Coordinate } from '../../map/models.ts';
import { decodeDriver, decodeIdentity, decodeRevision } from './decode.ts';
import { matchingDevTrace, matchingTraceError, type MatchingTrace } from './devTrace.ts';
import { decodeTripHttpSnapshot } from './tripHttpSnapshot.ts';

interface MatchingClientOptions { trace?: MatchingTrace; now?: () => number; pollId?: () => string }
let pollSequence = 0;

/** Revision-based invalidations only. Snapshots always come through authoritative GET/commands. */
export function createMatchingClient(api: ApiClient, options: MatchingClientOptions = {}) {
  const trace = options.trace ?? matchingDevTrace; const now = options.now ?? Date.now;
  const nextPollId = options.pollId ?? (() => `poll-${now()}-${++pollSequence}`);
  let connection: Connection = 'reconnecting'; const listeners = new Set<() => void>();
  const revisions = new Map<string, number>();
  let recovery: ReturnType<typeof setTimeout> | undefined;
  let recoveryController: AbortController | undefined;
  const scheduleRecovery = () => {
    if (recovery || recoveryController || !listeners.size || connection === 'online') return;
    recovery = setTimeout(() => {
      recovery = undefined; recoveryController = new AbortController();
      void request({ path: '/v1/matching/session', method: 'GET', decode: decodeIdentity, signal: recoveryController.signal })
        .catch(() => {}).finally(() => { recoveryController = undefined; scheduleRecovery(); });
    }, 5000);
  };
  const status = (next: Connection) => {
    if (connection !== next) { connection = next; listeners.forEach(fn => fn()); }
    if (next === 'online' && recovery) { clearTimeout(recovery); recovery = undefined; }
    else if (next !== 'online') scheduleRecovery();
  };
  async function request<T>(input: ApiRequest<T>, timeout = 12_000) {
    const controller = new AbortController(); const abort = () => controller.abort();
    input.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeout);
    try {
      if (input.signal?.aborted) controller.abort();
      const result = await api.request({ ...input, signal: controller.signal }); status('online'); return result;
    } catch (error) { if (!input.signal?.aborted) status(error instanceof ApiError ? 'online' : 'offline'); throw error; }
    finally { clearTimeout(timer); input.signal?.removeEventListener('abort', abort); }
  }
  function subscribe(key: string, path: string, invalidate: () => void, reconnect: () => void) {
    const pollTrace: MatchingTrace = (event, fields) => trace(event, { ...fields,
      stream: key === 'driver' ? 'driver' : 'passenger_request', entity: key });
    const controller = new AbortController(); let attempts = 0; let cancelDelay: (() => void) | undefined;
    let stopReason = 'abort';
    void (async () => {
      while (!controller.signal.aborted) {
        const pollId = nextPollId(); const startedAt = now();
        try {
          if (attempts) status('reconnecting');
          const after = revisions.get(key) ?? 0;
          pollTrace('poll_start', { pollId, attempt: attempts + 1 });
          const result = await request({ path: `${path}?afterRevision=${after}`, method: 'GET', decode: decodeRevision, signal: controller.signal }, 30_000);
          if (controller.signal.aborted) {
            pollTrace('poll_stop', { pollId, aborted: true, reason: stopReason, durationMs: Math.max(0, now() - startedAt) }); break;
          }
          const advanced = result.revision > after; const reconnected = attempts > 0;
          pollTrace('poll_result', { pollId, revision: result.revision, advanced, durationMs: Math.max(0, now() - startedAt) });
          attempts = 0;
          if (advanced) {
            revisions.set(key, result.revision); pollTrace('poll_invalidation', { pollId, revision: result.revision }); invalidate();
          } else if (reconnected) { pollTrace('poll_reconnected', { pollId, revision: result.revision }); reconnect(); }
        } catch (error) {
          pollTrace('poll_error', { pollId, durationMs: Math.max(0, now() - startedAt), ...matchingTraceError(error) });
          if (controller.signal.aborted) {
            pollTrace('poll_stop', { pollId, aborted: true, reason: stopReason, durationMs: Math.max(0, now() - startedAt) }); break;
          }
          attempts++; const retryMs = Math.min(15_000, 500 * 2 ** Math.min(attempts - 1, 5));
          pollTrace('poll_retry', { pollId, attempt: attempts, retryMs });
          await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, retryMs);
            cancelDelay = () => { clearTimeout(timer); resolve(); };
          });
        }
        pollTrace('poll_stop', { pollId, aborted: controller.signal.aborted,
          reason: controller.signal.aborted ? stopReason : 'cycle_complete', durationMs: Math.max(0, now() - startedAt) });
      }
    })();
    return (reason = 'abort') => { stopReason = reason; controller.abort(); cancelDelay?.(); };
  }
  const rememberTrip = (value: ReturnType<typeof decodeTripHttpSnapshot>) => {
    revisions.set(value.id, Math.max(revisions.get(value.id) ?? 0, value.revision)); return value;
  };
  return {
    identity: (signal?: AbortSignal) => request({ path: '/v1/matching/session', method: 'GET', decode: decodeIdentity, signal }),
    activeRequest: async (signal?: AbortSignal, context?: { epoch?: number; expectedId?: string }) => {
      const value = await request({ path: '/v1/passenger/requests/active', method: 'GET', signal,
        decode: raw => {
          if (raw === null) return null;
          const trip = decodeTripHttpSnapshot(raw, { origin: 'active_request', endpoint: 'active',
            expectedId: context?.expectedId, epoch: context?.epoch, trace });
          if (!['searching', 'reassigning', 'assigned'].includes(trip.phase)) throw new Error('invalid_active_request');
          return trip;
        } });
      return value ? rememberTrip(value) : null;
    },
    request: async (quoteId: string, requestId: string, context?: { epoch?: number }) => rememberTrip(await request({ path: '/v1/passenger/requests', method: 'POST',
      body: { quoteId, requestId }, decode: raw => decodeTripHttpSnapshot(raw, { origin: 'request_create', endpoint: 'collection', epoch: context?.epoch, trace }) })),
    fetch: async (id: string, signal?: AbortSignal, context?: { epoch?: number }) => rememberTrip(await request({ path: `/v1/passenger/requests/${encodeURIComponent(id)}`,
      method: 'GET', decode: raw => decodeTripHttpSnapshot(raw, { origin: 'request_fetch', endpoint: 'request', expectedId: id, epoch: context?.epoch, trace }), signal })),
    execute: async (command: TripCommand, context?: { epoch?: number }) => rememberTrip(await request({ path: `/v1/passenger/requests/${encodeURIComponent(command.tripId)}/commands`,
      method: 'POST', body: command, decode: raw => decodeTripHttpSnapshot(raw, { origin: 'request_command', endpoint: 'commands', expectedId: command.tripId, epoch: context?.epoch, trace }) })),
    getConnection: () => connection,
    subscribeConnection: (fn: () => void) => {
      listeners.add(fn); scheduleRecovery(); return () => {
        listeners.delete(fn); if (!listeners.size) { if (recovery) clearTimeout(recovery); recovery = undefined; recoveryController?.abort(); }
      };
    },
    subscribeTrip: ((id, invalidate, reconnect) => subscribe(id, `/v1/passenger/requests/${encodeURIComponent(id)}/changes`,
      () => invalidate({ tripId: id }), reconnect)) as PassengerGateway['subscribeTrip'],
    driver: async (signal?: AbortSignal) => {
      const d = await request({ path: '/v1/driver/state', method: 'GET', decode: decodeDriver, signal });
      revisions.set('driver', Math.max(revisions.get('driver') ?? 0, d.revision)); return d;
    },
    subscribeDriver: (invalidate: () => void) => subscribe('driver', '/v1/driver/changes', invalidate, invalidate),
    availability: (availability: 'AVAILABLE' | 'OFFLINE', operationId: string) => request({ path: '/v1/driver/availability', method: 'POST',
      body: { availability, operationId }, decode: decodeDriver }),
    location: (coordinate: Coordinate, heading: number | undefined, operationId: string, signal?: AbortSignal) => request({ path: '/v1/driver/location', method: 'POST',
      body: { coordinate, ...(heading !== undefined ? { heading } : {}), operationId }, decode: decodeDriver, signal }),
    offerAction: (id: string, action: 'accept' | 'reject', actionId: string) => request({ path: `/v1/driver/offers/${encodeURIComponent(id)}/${action}`,
      method: 'POST', body: { actionId }, decode: decodeDriver }),
    cancelAssignment: (id: string, actionId: string, assignmentId: string) => request({ path: `/v1/driver/assignments/${encodeURIComponent(id)}/cancel`, method: 'POST',
      body: { actionId, assignmentId }, decode: decodeDriver }),
    lifecycleCommand: (id: string, assignmentId: string, commandId: string, command: LifecycleCommand) => request({
      path: '/v1/driver/assignments/' + encodeURIComponent(id) + '/commands', method: 'POST',
      body: { assignmentId, commandId, command }, decode: decodeDriver }),
    telemetry: (id: string, assignmentId: string, sample: TripTelemetry) => request({
      path: '/v1/driver/assignments/' + encodeURIComponent(id) + '/telemetry', method: 'POST',
      body: { assignmentId, sample }, decode: decodeDriver }),
  };
}
export type MatchingClient = ReturnType<typeof createMatchingClient>;
