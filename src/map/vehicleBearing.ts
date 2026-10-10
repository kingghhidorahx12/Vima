import type { Coordinate } from './models.ts';

export interface BearingFix { coordinate: Coordinate; heading?: number; receivedAt: number }
const valid = (heading: number | undefined): heading is number =>
  heading !== undefined && Number.isFinite(heading) && heading >= 0 && heading < 360;

/** Measured travel direction, not a road-axis/map-matching claim. Never move the coordinate. */
export function resolveVehicleBearing(previous: BearingFix | undefined, incoming: BearingFix): number | undefined {
  if (!previous || incoming.receivedAt - previous.receivedAt > 60_000) return valid(incoming.heading) ? incoming.heading : undefined;
  if (incoming.receivedAt < previous.receivedAt) return previous.heading;
  const radians = Math.PI / 180;
  const lat1 = previous.coordinate[1] * radians; const lat2 = incoming.coordinate[1] * radians;
  const lng = (incoming.coordinate[0] - previous.coordinate[0]) * radians;
  const area = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lng / 2) ** 2;
  const distance = 2 * 6371000 * Math.atan2(Math.sqrt(area), Math.sqrt(Math.max(0, 1 - area)));
  // Below GPS noise: do not rotate a stopped car as the sensor heading wanders.
  if (distance < 8) return valid(previous.heading) ? previous.heading : valid(incoming.heading) ? incoming.heading : undefined;
  const elapsed = (incoming.receivedAt - previous.receivedAt) / 1000;
  // A discontinuity cannot establish direction (reacquisition/outlier), nor an invented road snap.
  if (elapsed <= 0 || distance / elapsed > 60) return valid(incoming.heading) ? incoming.heading : previous.heading;
  const course = (Math.atan2(Math.sin(lng) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng)) / radians + 360) % 360;
  // GPS course is useful only when consistent with significant measured displacement.
  // In particular the planned pickup route cannot decide which direction the driver is travelling.
  const difference = valid(incoming.heading) ? Math.abs(((incoming.heading - course + 540) % 360) - 180) : Infinity;
  return difference <= 35 ? incoming.heading : course;
}
