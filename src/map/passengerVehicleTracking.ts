import type { Coordinate } from './models.ts';
import { resolveVehicleBearing, type BearingFix } from './vehicleBearing.ts';
import { matchingLocationPolicy } from '../services/matching/policy.ts';

/** Display policy only. These values never enter a request, persisted sample or fare. */
export const passengerTrackingPolicy = {
  recentMs: matchingLocationPolicy.watcherTimeoutMs,
  expiredMs: matchingLocationPolicy.ttlMs,
  maximumSpeedMps: 60,
  headingDistanceMeters: 8,
} as const;
export interface ObservedVehicleFix extends BearingFix { readonly sequence: number }
export interface PassengerTrackingState {
  readonly observed?: ObservedVehicleFix;
  readonly visual?: { readonly fix: ObservedVehicleFix; readonly heading: number | null; readonly reconnected: boolean };
  readonly headingAnchor?: BearingFix;
  readonly pending?: ObservedVehicleFix;
  readonly interrupted?: boolean;
}
export type VehicleFreshness = 'unavailable' | 'recent' | 'delayed' | 'expired';
export interface PassengerVehicleTracking {
  readonly state: PassengerTrackingState;
  readonly freshness: VehicleFreshness;
  readonly paused: boolean;
  readonly opacity: number;
  readonly message: string;
}
const validHeading = (h: number | undefined): h is number => h !== undefined && Number.isFinite(h) && h >= 0 && h < 360;
export function validObservedFix(fix: ObservedVehicleFix, now: number): boolean {
  return Number.isSafeInteger(fix.sequence) && fix.sequence >= 0 && Number.isSafeInteger(fix.receivedAt) &&
    fix.receivedAt >= 0 && fix.receivedAt <= now + 5000 && Array.isArray(fix.coordinate) && fix.coordinate.length === 2 &&
    fix.coordinate.every(Number.isFinite) && Math.abs(fix.coordinate[0]) <= 180 && Math.abs(fix.coordinate[1]) <= 90;
}
export function observedDistance(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180; const lat = (b[1] - a[1]) * rad; const lng = (b[0] - a[0]) * rad;
  const area = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lng / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(area), Math.sqrt(Math.max(0, 1 - area)));
}
function coherent(a: ObservedVehicleFix, b: ObservedVehicleFix): boolean {
  const seconds = (b.receivedAt - a.receivedAt) / 1000;
  return seconds > 0 && observedDistance(a.coordinate, b.coordinate) / seconds <= passengerTrackingPolicy.maximumSpeedMps;
}

/** Never projects onto a road or planned route. A discontinuity needs a second coherent GPS fix. */
export function advancePassengerTracking(previous: PassengerTrackingState, fix: ObservedVehicleFix | undefined,
  online: boolean, now: number): PassengerTrackingState {
  if (!online && previous.visual && !previous.interrupted) previous = { ...previous, interrupted: true };
  if (!fix || !validObservedFix(fix, now)) return previous;
  const old = previous.observed;
  if (old && (fix.sequence <= old.sequence || fix.receivedAt <= old.receivedAt)) return previous;
  const observed = { ...fix, coordinate: [...fix.coordinate] as Coordinate };
  const last = previous.visual?.fix;
  // A restored snapshot may supply a last known position while offline, never a live one.
  if (!online && last) return { ...previous, observed, interrupted: true };
  const jump = !!last && !coherent(last, observed);
  const corroborated = previous.pending && coherent(previous.pending, observed) &&
    observed.receivedAt - previous.pending.receivedAt < passengerTrackingPolicy.recentMs;
  if (jump && !corroborated) return { ...previous, observed, pending: observed };
  const gap = !last || observed.receivedAt - last.receivedAt >= passengerTrackingPolicy.recentMs;
  const stale = now - observed.receivedAt >= passengerTrackingPolicy.recentMs;
  const anchor = previous.headingAnchor;
  const headingExpired = !anchor || observed.receivedAt - anchor.receivedAt >= passengerTrackingPolicy.expiredMs;
  const reacquired = gap || jump || !!previous.pending || !!previous.interrupted;
  const moved = !!anchor && observedDistance(anchor.coordinate, observed.coordinate) >= passengerTrackingPolicy.headingDistanceMeters;
  const heading = stale || last && (reacquired || headingExpired) ? null : !last
    ? validHeading(observed.heading) ? observed.heading : null
    : !moved ? anchor?.heading ?? null : resolveVehicleBearing(anchor, observed) ?? null;
  const advanceAnchor = reacquired || headingExpired || !anchor ||
    moved;
  return { observed, visual: { fix: observed, heading, reconnected: reacquired },
    interrupted: !online, headingAnchor: advanceAnchor ? { coordinate: observed.coordinate, receivedAt: observed.receivedAt,
      ...(heading !== null ? { heading } : {}) } : anchor };
}

export function passengerTrackingPresentation(state: PassengerTrackingState, online: boolean, now: number): PassengerVehicleTracking {
  const fix = state.visual?.fix;
  const age = fix ? Math.max(0, now - fix.receivedAt) : 0;
  const freshness: VehicleFreshness = !fix ? 'unavailable' : age < passengerTrackingPolicy.recentMs ? 'recent'
    : age < passengerTrackingPolicy.expiredMs ? 'delayed' : 'expired';
  const paused = !online || freshness !== 'recent' || !!state.pending || !!state.interrupted;
  const elapsed = age < 60_000 ? `${Math.floor(age / 1000)} s` : `${Math.floor(age / 60_000)} min`;
  const message = !fix ? 'Esperando ubicación del conductor.' : state.pending
    ? `Señal GPS discontinua · Última ubicación válida hace ${elapsed}.`
    : !online ? `Sin conexión · Última ubicación hace ${elapsed}.`
    : state.interrupted ? `Recuperando ubicación · Última ubicación hace ${elapsed}.`
    : freshness === 'recent' ? '' : `Última ubicación hace ${elapsed} · ${freshness === 'expired' ? 'Datos caducados' : 'Datos retrasados'}.`;
  return { state, freshness, paused, opacity: paused ? 0.5 : 1, message };
}
