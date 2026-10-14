import type { DriverState } from '../../services/matching/contracts.ts';
import type { RideSheetInteraction } from '../../design/components/VimaRideSheet';
import { nearestSheetSnap } from '../../design/components/rideSheetGeometry.ts';
import { motionTimings } from '../../motion/timing.ts';

/** Approved visible-map proportions, measured after safe areas (never theme dependent). */
export function driverViewportPhase(state?: DriverState) {
  return state?.offer ? 'OFFER' : state?.assignment?.state ?? state?.availability ?? 'OFFLINE';
}
export function driverSheetInteraction(height: number, state?: DriverState | string, minimumHeight = 0): RideSheetInteraction | undefined {
  if (!Number.isFinite(height) || height <= 0) return undefined;
  const phase = typeof state === 'string' ? state : driverViewportPhase(state);
  const [collapsed, expanded] = phase === 'OFFER' ? [0.47, 0.47]
    : phase === 'IN_PROGRESS' ? [0.23, 0.48]
      : phase === 'ASSIGNED' ? [0.28, 0.52]
        : ['ARRIVED_PICKUP', 'PAYMENT_PENDING'].includes(phase) ? [0.52, 0.52] : [0.36, 0.36];
  // Real error/PIN/action content may need more room; never push recovery under the fold.
  const rest = Math.min(height, Math.max(height * collapsed!, minimumHeight));
  const full = Math.max(rest, Math.min(height, height * expanded!));
  const allowedOffsets = rest === full ? [height - rest] : [height - full, height - rest];
  return { height, targetOffset: height - rest, minOffset: height - full, maxOffset: height - rest,
    allowedOffsets, timing: motionTimings.sheetSnap, settle: offset => {
      'worklet';
      return nearestSheetSnap(offset, allowedOffsets);
    } };
}
