/** Vima coordinates are always [longitude, latitude], independently of the SDK. */
export type Coordinate = readonly [longitude: number, latitude: number];
/** west > east explicitly represents a box crossing the antimeridian. */
export interface Bounds { readonly southwest: Coordinate; readonly northeast: Coordinate }
export interface MapPadding { top?: number; right?: number; bottom?: number; left?: number }
export type CameraTarget = {
  zoom?: number; bearing?: number; pitch?: number; padding?: MapPadding;
} & ({ center: Coordinate; coordinates?: never; bounds?: never }
  | { coordinates: readonly Coordinate[]; center?: never; bounds?: never }
  | { bounds: Bounds; center?: never; coordinates?: never });
export interface ApprovedCameraMotion { readonly duration: number; readonly easing: 'linear' | 'ease' | 'fly' }
export interface CircleAppearance { radius: number; color?: string; strokeWidth?: number; strokeColor?: string }
export interface RouteAppearance { width: number; opacity: number; cap?: 'butt' | 'round' | 'square'; join?: 'bevel' | 'round' | 'miter' }

export function normalizeCoordinate(value: unknown): Coordinate {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) ||
    Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error('invalid_coordinate');
  return [value[0], value[1]];
}
export function normalizeBounds(value: unknown): Bounds {
  if (!value || typeof value !== 'object') throw new Error('invalid_bounds');
  const input = value as Bounds;
  const southwest = normalizeCoordinate(input.southwest);
  const northeast = normalizeCoordinate(input.northeast);
  if (southwest[1] > northeast[1]) throw new Error('invalid_bounds');
  return { southwest, northeast };
}
