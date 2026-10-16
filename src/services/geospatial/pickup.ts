import { normalizeCoordinate, type Coordinate } from '../../map/models.ts';
import { distanceMeters } from './placeIdentity.ts';

/** Pickup adjustment policy, independent of the Driver arrival radius. */
export const pickupAdjustmentMaxMeters = 200;
export function samePickup(a: Coordinate, b: Coordinate) { return a[0] === b[0] && a[1] === b[1]; }
export function pickupDistanceMeters(a: Coordinate, b: Coordinate) {
  return distanceMeters(normalizeCoordinate(a), normalizeCoordinate(b));
}
export function withinPickupArea(reference: Coordinate, pickup: Coordinate, limit = pickupAdjustmentMaxMeters) {
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('invalid_pickup_adjustment_limit');
  // Sub-micrometre numerical tolerance, not an extra operational allowance.
  return pickupDistanceMeters(reference, pickup) <= limit + 1e-7;
}
