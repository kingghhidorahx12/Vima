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

/** Smallest longitudinal arc containing all points, then south/north bounds. */
export function fitBounds(points: readonly Coordinate[]): [number, number, number, number] {
  if (points.length < 2) throw new Error('invalid_bounds');
  const valid = points.map(normalizeCoordinate);
  const latitudes = valid.map((point) => point[1]);
  const longitudes = valid.map((point) => (point[0] + 360) % 360).sort((a, b) => a - b);
  let largestGap = -1;
  let end = 0;
  for (let i = 0; i < longitudes.length; i += 1) {
    const next = (i + 1) % longitudes.length;
    const gap = (longitudes[next]! - longitudes[i]! + 360) % 360;
    if (gap > largestGap) { largestGap = gap; end = next; }
  }
  const west = longitudes[end]! > 180 ? longitudes[end]! - 360 : longitudes[end]!;
  const eastIndex = (end + longitudes.length - 1) % longitudes.length;
  const east = longitudes[eastIndex]! > 180 ? longitudes[eastIndex]! - 360 : longitudes[eastIndex]!;
  return [west, Math.min(...latitudes), east, Math.max(...latitudes)];
}
