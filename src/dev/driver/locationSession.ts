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
  getForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  getProviderStatusAsync(): Promise<DriverLocationProviderStatus>;
  getLastKnownPositionAsync(): Promise<DriverLocationSample | null>;
  watchPositionAsync(options: { accuracy: number; timeInterval: number; distanceInterval: number },
    callback: (sample: DriverLocationSample) => void, errorHandler: (reason: string) => void): Promise<DriverLocationSubscription>;
  balancedAccuracy: number;
}
export interface DriverLocationSessionOptions {
  location: DriverLocationAdapter; now?: () => number; operationId: () => string;
  locationSessionId?: string; trace?: MatchingTrace; foreground?: boolean;
  onPermissionPromptChange?: (active: boolean) => void;
  send: (coordinate: Coordinate, heading: number | undefined, operationId: string, signal: AbortSignal) =>
    Promise<{ availability: string; revision: number }>;
  onError: (message: string) => void; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout;
}

export type DriverLocationStopReason = 'unmount' | 'unfocused' | 'availability_changed' | 'account_changed';

let sessionSequence = 0;

const normalizeSample = (sample: DriverLocationSample): { coordinate: Coordinate; heading?: number } | undefined => {
  const { longitude, latitude, heading } = sample.coords;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return undefined;
  return { coordinate: [longitude, latitude], ...(heading !== null && heading !== undefined && Number.isFinite(heading) && heading >= 0 && heading < 360 ? { heading } : {}) };
};

/** Logical Driver location lifecycle. The native watcher exists only while foregrounded. */
export function createDriverLocationSession(options: DriverLocationSessionOptions) {
  const now = options.now ?? Date.now; const setTimer = options.setTimer ?? setTimeout; const clearTimer = options.clearTimer ?? clearTimeout;
  const trace = options.trace ?? matchingDevTrace; const locationSessionId = options.locationSessionId ?? `location-${now()}-${++sessionSequence}`;
  const startedAt = now(); const event = (name: Parameters<MatchingTrace>[0], fields: Parameters<MatchingTrace>[1] = {}) =>
    trace(name, { locationSessionId, durationMs: Math.max(0, now() - startedAt), ...fields });
  const controller = new AbortController(); let stopped = false; let foreground = options.foreground ?? true;
  let subscription: DriverLocationSubscription | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined; let retry: ReturnType<typeof setTimeout> | undefined;
  let sends = Promise.resolve(); let preparing = false; let attaching = false; let lastKnownChecked = false; let watchGeneration = 0;
  let permission: 'checking' | 'requesting' | 'granted' | 'denied' = 'checking';
  let permissionCheckResolved = false;
  let permissionPromptActive = false; let promptLostForeground = false; let permissionRequestResolved = false;
  const gate = (reason: 'not_foreground' | 'permission_prompt' | 'provider_disabled' | 'tracking_allowed') =>
    event('location_gate', { reason });
  const setPermissionPromptActive = (active: boolean) => {
    if (permissionPromptActive === active) return;
    permissionPromptActive = active; options.onPermissionPromptChange?.(active);
  };
  const clearWatchdog = () => { if (watchdog) clearTimer(watchdog); watchdog = undefined; };
  const clearRetry = () => { if (retry) clearTimer(retry); retry = undefined; };
  const removeWatcher = () => { watchGeneration++; subscription?.remove(); subscription = undefined; clearWatchdog(); };
  const pauseNativeTracking = () => { clearRetry(); removeWatcher(); };
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
    if (stopped || !foreground || permission !== 'granted' || retry) return;
    retry = setTimer(() => { retry = undefined; if (stopped || !foreground) return; event('watch_retry', { retryMs: matchingLocationPolicy.watcherRetryMs }); void prepare(); },
      matchingLocationPolicy.watcherRetryMs);
  };
  const armWatchdog = () => {
    clearWatchdog(); if (stopped || !foreground) return;
    watchdog = setTimer(() => { watchdog = undefined; if (stopped || !foreground) return; removeWatcher();
      event('watchdog'); options.onError('Sin señal de ubicación. Reintentando…'); scheduleRetry(); }, matchingLocationPolicy.watcherTimeoutMs);
  };
  const attach = async () => {
    if (stopped || !foreground || permission !== 'granted' || subscription || attaching) return;
    attaching = true; let failed = false; let firstValidSampleReceived = false; const generation = ++watchGeneration;
    event('watch_attach');
    try {
      const created = await options.location.watchPositionAsync({ accuracy: options.location.balancedAccuracy, timeInterval: 5_000, distanceInterval: 0 }, sample => {
        if (stopped || !foreground || generation !== watchGeneration) return;
        event('watch_callback');
        if (send(sample) && !firstValidSampleReceived) {
          firstValidSampleReceived = true;
          clearWatchdog();
        }
      }, () => {
        if (stopped || !foreground || failed || generation !== watchGeneration) return; failed = true; event('watch_error', { code: 'provider_error' });
        removeWatcher(); options.onError('Se interrumpió la ubicación. Reintentando…'); if (!attaching) scheduleRetry();
      });
      if (stopped || !foreground || failed || generation !== watchGeneration) { created.remove(); if (failed && !stopped && foreground) scheduleRetry(); return; }
      subscription = created; event('watch_attached'); if (!firstValidSampleReceived) armWatchdog();
    } catch (error) {
      if (!stopped && foreground) { event('watch_error', matchingTraceError(error)); options.onError('No se pudo iniciar la ubicación. Reintentando…'); scheduleRetry(); }
    } finally {
      attaching = false;
      // Foreground may have returned while the old native attach was still resolving.
      if (!stopped && foreground && permission === 'granted' && !subscription && !retry) void prepare();
    }
  };
  prepare = async () => {
    if (stopped || !foreground || permission !== 'granted' || subscription || preparing || attaching) return;
    preparing = true;
    try {
      event('provider_check'); const provider = await options.location.getProviderStatusAsync(); if (stopped || !foreground || permission !== 'granted') return;
      const providerSignals = [provider.gpsAvailable, provider.networkAvailable, provider.passiveAvailable];
      const providerAvailable = providerSignals.every(value => value === undefined) || providerSignals.some(value => value === true);
      const enabled = provider.locationServicesEnabled && providerAvailable;
      event('provider_result', { enabled, gpsAvailable: provider.gpsAvailable === true,
        networkAvailable: provider.networkAvailable === true, passiveAvailable: provider.passiveAvailable === true });
      if (!enabled) { gate('provider_disabled'); options.onError('Activa los servicios de ubicación para recibir ofertas.'); scheduleRetry(); return; }
      gate('tracking_allowed');
      if (!lastKnownChecked) {
        lastKnownChecked = true; const last = await options.location.getLastKnownPositionAsync(); if (stopped || !foreground || permission !== 'granted') return;
        const fresh = !!last && isMatchingLocationFresh(last.timestamp, now()); event('last_known_result', { present: !!last, fresh });
        if (last && fresh) send(last);
      }
    } catch (error) {
      if (!stopped && foreground) { event('watch_error', matchingTraceError(error)); options.onError('No se pudo comprobar la ubicación. Reintentando…'); scheduleRetry(); }
      return;
    } finally { preparing = false; }
    await attach();
  };
  const finishPermissionPromptWhenReady = () => {
    if (!permissionPromptActive || !permissionRequestResolved) return false;
    if (promptLostForeground && !foreground) { gate('permission_prompt'); return false; }
    setPermissionPromptActive(false); return true;
  };
  const requestPermission = async () => {
    if (stopped || permission !== 'checking') return;
    if (!foreground) { gate('not_foreground'); return; }
    permission = 'requesting'; permissionRequestResolved = false; promptLostForeground = false;
    setPermissionPromptActive(true); event('permission_request');
    try {
      const result = await options.location.requestForegroundPermissionsAsync();
      if (stopped) return;
      permissionRequestResolved = true; permission = result.granted ? 'granted' : 'denied';
      event('permission_result', { granted: result.granted }); finishPermissionPromptWhenReady();
      if (!result.granted) { options.onError('Se necesita ubicación para recibir ofertas.'); return; }
      if (foreground && !permissionPromptActive) await prepare();
    } catch (error) {
      if (stopped) return;
      permissionRequestResolved = true; permission = 'denied'; finishPermissionPromptWhenReady();
      event('watch_error', matchingTraceError(error)); options.onError('No se pudo iniciar la ubicación.');
    }
  };
  const checkPermission = async () => {
    try {
      event('permission_check'); const result = await options.location.getForegroundPermissionsAsync();
      if (stopped || permission !== 'checking') return;
      permissionCheckResolved = true;
      if (result.granted) {
        permission = 'granted'; event('permission_result', { granted: true, existing: true });
        if (foreground) await prepare(); else gate('not_foreground');
      } else await requestPermission();
    } catch (error) {
      if (!stopped) { permission = 'denied'; event('watch_error', matchingTraceError(error)); options.onError('No se pudo comprobar el permiso de ubicación.'); }
    }
  };

  event('location_session_start'); void checkPermission();
  return {
    locationSessionId,
    setForeground(active: boolean) {
      if (stopped || foreground === active) return;
      foreground = active;
      if (!active) {
        if (permissionPromptActive) { promptLostForeground = true; gate('permission_prompt'); }
        else gate('not_foreground');
        pauseNativeTracking(); return;
      }
      if (permissionPromptActive && !finishPermissionPromptWhenReady()) return;
      if (permission === 'checking' && permissionCheckResolved) void requestPermission();
      else if (permission === 'granted') void prepare();
    },
    stop(reason: DriverLocationStopReason = 'unmount') {
      if (stopped) return;
      stopped = true; controller.abort(); clearRetry(); removeWatcher(); setPermissionPromptActive(false);
      event('location_session_stop', { reason });
    },
  };
}
