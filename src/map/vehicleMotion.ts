import { motionTimings } from '../motion/timing.ts';

import type { Coordinate } from './models.ts';
export type { Coordinate } from './models.ts';

export interface VehiclePose {
  readonly coordinate: Coordinate;
  readonly heading: number;
}

export interface VehicleSample extends VehiclePose {
  /** Monotonically increasing sequence from the authoritative stream. */
  readonly sequence: number;
  readonly reconnected?: boolean;
}

export interface VehicleMotionConfig {
  readonly durationMs: number;
  readonly easing: (progress: number) => number;
  readonly shouldSnap: (from: Coordinate, to: Coordinate) => boolean;
}

/** Driver GPS may not yet have a direction. This does not weaken VehicleSample. */
export interface DriverVehiclePose { readonly coordinate: Coordinate; readonly heading: number | null }
export interface DriverVehicleSample extends DriverVehiclePose { readonly sequence: number; readonly reconnected?: boolean }
export function validHeading(value: unknown): value is number {
  'worklet';
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 360;
}
export function validateDriverVehicleSample(sample: DriverVehicleSample): boolean {
  'worklet';
  const [lng, lat] = sample.coordinate;
  return Number.isSafeInteger(sample.sequence) && Number.isFinite(lng) && Number.isFinite(lat) &&
    lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}
export function interpolateDriverVehiclePose(from: DriverVehiclePose, to: DriverVehiclePose, progress: number): DriverVehiclePose {
  'worklet';
  return { coordinate: interpolateCoordinate(from.coordinate, to.coordinate, progress),
    heading: from.heading === null || to.heading === null ? to.heading : interpolateHeading(from.heading, to.heading, progress) };
}

/** Technical update budget requested in P0, not a Motion System duration. */
export const vehicleUpdatesPerSecond = 12;

/** Only the large-jump criterion remains a required integration input. Both functions are worklets. */
export function createVehicleMotion(shouldSnap: VehicleMotionConfig['shouldSnap']): VehicleMotionConfig {
  return { durationMs: motionTimings.map.duration, easing: motionTimings.map.easing, shouldSnap };
}

export function interpolateHeading(from: number, to: number, progress: number): number {
  'worklet';
  const delta = ((to - from + 540) % 360) - 180;
  return ((from + delta * progress) % 360 + 360) % 360;
}

export function interpolateVehiclePose(from: VehiclePose, to: VehiclePose, progress: number): VehiclePose {
  'worklet';
  return { coordinate: interpolateCoordinate(from.coordinate, to.coordinate, progress),
    heading: interpolateHeading(from.heading, to.heading, progress) };
}

export function interpolateCoordinate(from: Coordinate, to: Coordinate, progress: number): Coordinate {
  'worklet';
  const longitudeDelta = ((to[0] - from[0] + 540) % 360) - 180;
  const longitude = ((from[0] + longitudeDelta * progress + 540) % 360) - 180;
  return [longitude, from[1] + (to[1] - from[1]) * progress];
}

export function validateVehicleSample(sample: VehicleSample): boolean {
  'worklet';
  const [lng, lat] = sample.coordinate;
  return Number.isSafeInteger(sample.sequence) && Number.isFinite(lng) && Number.isFinite(lat) &&
    Number.isFinite(sample.heading) && sample.heading >= 0 && sample.heading < 360 &&
    lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

export function canInterpolateVehicle(
  from: Coordinate | null,
  sample: VehicleSample,
  reducedMotion: boolean,
  config?: VehicleMotionConfig,
): boolean {
  'worklet';
  return !!from && !reducedMotion && !sample.reconnected && !!config &&
    Number.isFinite(config.durationMs) && config.durationMs > 0 && !config.shouldSnap(from, sample.coordinate);
}
