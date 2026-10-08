import type { Coordinate } from '../../map/models.ts';
import { matchingDevTrace, matchingTraceError, type MatchingTrace } from '../../services/matching/devTrace.ts';
import { isMatchingLocationFresh, matchingLocationPolicy } from '../../services/matching/policy.ts';

export interface DriverLocationSample {
  timestamp: number;
  coords: { longitude: number; latitude: number; heading?: number | null };
}
export interface DriverLocationSubscription { remove(): void }
export interface DriverLocationProviderStatus {
  locationServicesEnabled: boolean; gpsAvailable?: boolean; networkAvailable?: boolean; passiveAvailable?: boolean;
}
export interface DriverLocationAdapter {
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  getProviderStatusAsync(): Promise<DriverLocationProviderStatus>;
  getLastKnownPositionAsync(): Promise<DriverLocationSample | null>;
  watchPositionAsync(options: { accuracy: number; timeInterval: number; distanceInterval: number },
    callback: (sample: DriverLocationSample) => void, errorHandler: (reason: string) => void): Promise<DriverLocationSubscription>;
  balancedAccuracy: number;
}
export interface DriverLocationSessionOptions {
  location: DriverLocationAdapter; now?: () => number; operationId: () => string;
  locationSessionId?: string; trace?: MatchingTrace;
  send: (coordinate: Coordinate, heading: number | undefined, operationId: string, signal: AbortSignal) =>
    Promise<{ availability: string; revision: number }>;
  onError: (message: string) => void; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout;
}

let sessionSequence = 0;

const normalizeSample = (sample: DriverLocationSample): { coordinate: Coordinate; heading?: number } | undefined => {
  const { longitude, latitude, heading } = sample.coords;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return undefined;
  return { coordinate: [longitude, latitude], ...(heading !== null && heading !== undefined && Number.isFinite(heading) && heading >= 0 && heading < 360 ? { heading } : {}) };
};

/** Foreground-only lifecycle. Call stop on blur/background/state change/unmount. */
export function createDriverLocationSession(options: DriverLocationSessionOptions) {
  const now = options.now ?? Date.now; const setTimer = options.setTimer ?? setTimeout; const clearTimer = options.clearTimer ?? clearTimeout;
  const trace = options.trace ?? matchingDevTrace; const locationSessionId = options.locationSessionId ?? `location-${now()}-${++sessionSequence}`;
  const startedAt = now(); const event = (name: Parameters<MatchingTrace>[0], fields: Parameters<MatchingTrace>[1] = {}) =>
    trace(name, { locationSessionId, durationMs: Math.max(0, now() - startedAt), ...fields });
  const controller = new AbortController(); let stopped = false; let subscription: DriverLocationSubscription | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined; let retry: ReturnType<typeof setTimeout> | undefined;
  let sends = Promise.resolve(); let preparing = false; let attaching = false; let lastKnownChecked = false; let watchGeneration = 0;
  const clearWatchdog = () => { if (watchdog) clearTimer(watchdog); watchdog = undefined; };
  const clearRetry = () => { if (retry) clearTimer(retry); retry = undefined; };
  const removeWatcher = () => { watchGeneration++; subscription?.remove(); subscription = undefined; clearWatchdog(); };
  const send = (sample: DriverLocationSample) => {
    const value = normalizeSample(sample); if (!value || stopped) return false;
    const operationId = options.operationId();
    sends = sends.then(async () => {
      if (stopped || controller.signal.aborted) return;
      event('location_post_start');
      try {
        const receipt = await options.send(value.coordinate, value.heading, operationId, controller.signal);
        if (!stopped && !controller.signal.aborted) event('location_post_receipt', { availability: receipt.availability, revision: receipt.revision });
      } catch (error) {
        if (!stopped && !controller.signal.aborted) {
          event('location_post_error', matchingTraceError(error)); options.onError('No se pudo actualizar la ubicación.');
        }
      }
    });
    return true;
  };
  let prepare!: () => Promise<void>;
  const scheduleRetry = () => {
    if (stopped || retry) return;
    retry = setTimer(() => { retry = undefined; if (stopped) return; event('watch_retry', { retryMs: matchingLocationPolicy.watcherRetryMs }); void prepare(); },
      matchingLocationPolicy.watcherRetryMs);
  };
  const armWatchdog = () => {
    clearWatchdog(); if (stopped) return;
    watchdog = setTimer(() => { watchdog = undefined; if (stopped) return; removeWatcher();
      event('watchdog'); options.onError('Sin señal de ubicación. Reintentando…'); scheduleRetry(); }, matchingLocationPolicy.watcherTimeoutMs);
  };
  const attach = async () => {
    if (stopped || subscription || attaching) return;
    attaching = true; let failed = false; const generation = ++watchGeneration;
    event('watch_attach');
    try {
      const created = await options.location.watchPositionAsync({ accuracy: options.location.balancedAccuracy, timeInterval: 5_000, distanceInterval: 10 }, sample => {
        if (stopped || generation !== watchGeneration) return; event('watch_callback'); if (send(sample)) armWatchdog();
      }, () => {
        if (stopped || failed || generation !== watchGeneration) return; failed = true; event('watch_error', { code: 'provider_error' });
        removeWatcher(); options.onError('Se interrumpió la ubicación. Reintentando…'); if (!attaching) scheduleRetry();
      });
      if (stopped || failed || generation !== watchGeneration) { created.remove(); if (failed && !stopped) scheduleRetry(); return; }
      subscription = created; event('watch_attached'); armWatchdog();
    } catch (error) {
      if (!stopped) { event('watch_error', matchingTraceError(error)); options.onError('No se pudo iniciar la ubicación. Reintentando…'); scheduleRetry(); }
    } finally { attaching = false; }
  };
  prepare = async () => {
    if (stopped || subscription || preparing || attaching) return;
    preparing = true;
    try {
      event('provider_check'); const provider = await options.location.getProviderStatusAsync(); if (stopped) return;
      const providerSignals = [provider.gpsAvailable, provider.networkAvailable, provider.passiveAvailable];
      const providerAvailable = providerSignals.every(value => value === undefined) || providerSignals.some(value => value === true);
      const enabled = provider.locationServicesEnabled && providerAvailable;
      event('provider_result', { enabled, gpsAvailable: provider.gpsAvailable === true,
        networkAvailable: provider.networkAvailable === true, passiveAvailable: provider.passiveAvailable === true });
      if (!enabled) { options.onError('Activa los servicios de ubicación para recibir ofertas.'); scheduleRetry(); return; }
      if (!lastKnownChecked) {
        lastKnownChecked = true; const last = await options.location.getLastKnownPositionAsync(); if (stopped) return;
        const fresh = !!last && isMatchingLocationFresh(last.timestamp, now()); event('last_known_result', { present: !!last, fresh });
        if (last && fresh) send(last);
      }
    } catch (error) {
      if (!stopped) { event('watch_error', matchingTraceError(error)); options.onError('No se pudo comprobar la ubicación. Reintentando…'); scheduleRetry(); }
      return;
    } finally { preparing = false; }
    await attach();
  };
  event('location_session_start');
  void (async () => {
    try {
      event('permission_request'); const permission = await options.location.requestForegroundPermissionsAsync(); if (stopped) return;
      event('permission_result', { granted: permission.granted });
      if (!permission.granted) { options.onError('Se necesita ubicación para recibir ofertas.'); return; }
      await prepare();
    } catch (error) { if (!stopped) { event('watch_error', matchingTraceError(error)); options.onError('No se pudo iniciar la ubicación. Reintentando…'); scheduleRetry(); } }
  })();
  return { stop() { if (stopped) return; stopped = true; controller.abort(); clearRetry(); removeWatcher(); event('location_session_stop'); } };
}
