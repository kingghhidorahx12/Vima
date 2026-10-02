import { normalizeCoordinate, normalizeBounds, type CameraTarget, type ApprovedCameraMotion } from '../models.ts';

export function googleCoordinate(coordinate: readonly number[]) {
  'worklet';
  return { latitude: coordinate[1]!, longitude: coordinate[0]! };
}
export function googleCameraCommand(target: CameraTarget, reducedMotion: boolean, motion?: ApprovedCameraMotion) {
  const animated = !reducedMotion && !!motion && motion.duration > 0;
  if (target.coordinates || target.bounds) {
    const bounds = target.bounds ? normalizeBounds(target.bounds) : undefined;
    const points = bounds ? [bounds.southwest, bounds.northeast] : target.coordinates!;
    if (points.length < 2) throw new Error('invalid_bounds');
    return { kind: 'fit' as const, coordinates: points.map((point) => googleCoordinate(normalizeCoordinate(point))),
      // MapView already applies padding; never add the sheet twice.
      options: { animated, edgePadding: { top: 0, left: 0, right: 0, bottom: 0 } } };
  }
  return { kind: 'camera' as const, animated, duration: animated ? motion!.duration : 0,
    camera: { center: googleCoordinate(normalizeCoordinate(target.center)),
      ...(target.zoom === undefined ? {} : { zoom: target.zoom }),
      ...(target.pitch === undefined ? {} : { pitch: target.pitch }),
      ...(target.bearing === undefined ? {} : { heading: target.bearing }) } };
}
