import { interpolateCoordinate } from './vehicleMotion.ts';

export type RouteFeature = GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>;

function distance(from: GeoJSON.Position, to: GeoJSON.Position): number {
  'worklet';
  const radians = Math.PI / 180;
  const lat1 = from[1]! * radians;
  const lat2 = to[1]! * radians;
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((to[0]! - from[0]!) * radians / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** Clip in angular distance along actual route geometry; disconnected lines add no connector. */
export function revealRoute(data: RouteFeature, progress: number): RouteFeature {
  'worklet';
  if (progress >= 1) return data;
  const lines = data.geometry.type === 'LineString' ? [data.geometry.coordinates] : data.geometry.coordinates;
  let total = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i += 1) total += distance(line[i - 1]!, line[i]!);
  }
  if (total === 0) return data;
  let remaining = total * Math.max(0, progress);
  const revealed: GeoJSON.Position[][] = [];
  for (const line of lines) {
    if (!line.length) continue;
    const partial: GeoJSON.Position[] = [line[0]!];
    for (let i = 1; i < line.length; i += 1) {
      const previous = line[i - 1]!;
      const current = line[i]!;
      const length = distance(previous, current);
      if (length > remaining) {
        const end = interpolateCoordinate([previous[0]!, previous[1]!], [current[0]!, current[1]!], remaining / length);
        partial.push([...end]);
        remaining = 0;
        break;
      }
      partial.push(current);
      remaining -= length;
    }
    if (partial.length === 1) partial.push(partial[0]!);
    revealed.push(partial);
    if (remaining <= 0) break;
  }
  return { ...data, geometry: data.geometry.type === 'LineString'
    ? { type: 'LineString', coordinates: revealed[0] ?? [] }
    : { type: 'MultiLineString', coordinates: revealed } };
}

export function routeFrame(data: RouteFeature, progress: number, reducedMotion: boolean): RouteFeature {
  'worklet';
  const visible = reducedMotion ? data : revealRoute(data, progress);
  return { ...visible, properties: { ...data.properties, vimaRevealOpacity: reducedMotion ? progress : 1 } };
}
