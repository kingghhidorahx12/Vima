import type { Coordinate } from '../../map/models.ts';
import { isMatchingLocationFresh, matchingLocationPolicy } from '../../services/matching/policy.ts';

export interface DriverLocationSample {
  timestamp: number;
  coords: { longitude: number; latitude: number; heading?: number | null };
}
export interface DriverLocationSubscription { remove(): void }
export interface DriverLocationAdapter {
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  getLastKnownPositionAsync(): Promise<DriverLocationSample | null>;
  watchPositionAsync(options: { accuracy: number; timeInterval: number; distanceInterval: number },
    callback: (sample: DriverLocationSample) => void): Promise<DriverLocationSubscription>;
  balancedAccuracy: number;
}
export interface DriverLocationSessionOptions {
  location: DriverLocationAdapter; now?: () => number; operationId: () => string;
  send: (coordinate: Coordinate, heading: number | undefined, operationId: string, signal: AbortSignal) => Promise<void>;
  onError: (message: string) => void; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout;
}

const normalizeSample = (sample: DriverLocationSample): { coordinate: Coordinate; heading?: number } | undefined => {
  const { longitude, latitude, heading } = sample.coords;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return undefined;
  return { coordinate: [longitude, latitude], ...(heading !== null && heading !== undefined && Number.isFinite(heading) && heading >= 0 && heading < 360 ? { heading } : {}) };
};

/** Foreground-only lifecycle. Call stop on blur/background/state change/unmount. */
export function createDriverLocationSession(options: DriverLocationSessionOptions) {
  const now = options.now ?? Date.now; const setTimer = options.setTimer ?? setTimeout; const clearTimer = options.clearTimer ?? clearTimeout;
  const controller = new AbortController(); let stopped = false; let subscription: DriverLocationSubscription | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined; let retry: ReturnType<typeof setTimeout> | undefined; let sends = Promise.resolve();
  const clearWatchdog = () => { if (watchdog) clearTimer(watchdog); watchdog = undefined; };
  const clearRetry = () => { if (retry) clearTimer(retry); retry = undefined; };
  const removeWatcher = () => { subscription?.remove(); subscription = undefined; clearWatchdog(); };
  const send = (sample: DriverLocationSample) => {
    const value = normalizeSample(sample); if (!value || stopped) return false;
    sends = sends.then(() => options.send(value.coordinate, value.heading, options.operationId(), controller.signal))
      .catch(() => { if (!stopped) options.onError('No se pudo actualizar la ubicación.'); });
    return true;
  };
  let attach!: () => Promise<void>;
  const scheduleRetry = () => {
    if (stopped || retry) return;
    retry = setTimer(() => { retry = undefined; void attach(); }, matchingLocationPolicy.watcherRetryMs);
  };
  const armWatchdog = () => {
    clearWatchdog(); if (stopped) return;
    watchdog = setTimer(() => { watchdog = undefined; if (stopped) return; removeWatcher();
      options.onError('Sin señal de ubicación. Reintentando…'); scheduleRetry(); }, matchingLocationPolicy.watcherTimeoutMs);
  };
  attach = async () => {
    if (stopped || subscription) return;
    try {
      const created = await options.location.watchPositionAsync({ accuracy: options.location.balancedAccuracy, timeInterval: 5_000, distanceInterval: 10 }, sample => {
        if (!stopped && send(sample)) armWatchdog();
      });
      if (stopped) { created.remove(); return; } subscription = created; armWatchdog();
    } catch { if (!stopped) { options.onError('No se pudo iniciar la ubicación. Reintentando…'); scheduleRetry(); } }
  };
  void (async () => {
    try {
      const permission = await options.location.requestForegroundPermissionsAsync(); if (stopped) return;
      if (!permission.granted) { options.onError('Se necesita ubicación para recibir ofertas.'); return; }
      const last = await options.location.getLastKnownPositionAsync();
      if (!stopped && last && isMatchingLocationFresh(last.timestamp, now())) send(last);
      await attach();
    } catch { if (!stopped) { options.onError('No se pudo iniciar la ubicación. Reintentando…'); scheduleRetry(); } }
  })();
  return { stop() { if (stopped) return; stopped = true; controller.abort(); clearRetry(); removeWatcher(); } };
}
