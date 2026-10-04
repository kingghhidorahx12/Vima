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

/** Cache angular offsets once per route. Repeated frames copy only a short window. */
export function indexRoute(data: RouteFeature) {
  const lines = data.geometry.type === 'LineString' ? [data.geometry.coordinates] : data.geometry.coordinates;
  let total = 0;
  const segments = lines.flatMap((line, part) => line.slice(1).map((end, i) => {
    const start = line[i]!; const from = total; total += distance(start, end);
    return { start, end, from, to: total, part };
  }));
  return { segments, total };
}
export function routeWindow(index: ReturnType<typeof indexRoute>, progress: number, width: number): RouteFeature {
  'worklet';
  if (progress <= 0 || progress >= 1) return { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [] } };
  const low = Math.max(0, progress - width) * index.total;
  const high = Math.min(1, progress) * index.total;
  // Binary search skips the whole route prefix. Output stays bounded by the visible window.
  let left = 0; let right = index.segments.length;
  while (left < right) { const middle = (left + right) >>> 1;
    if (index.segments[middle]!.to < low) left = middle + 1; else right = middle; }
  let points: GeoJSON.Position[] = []; let part = -1;
  for (let i = left; i < index.segments.length; i++) {
    const segment = index.segments[i]!;
    if (segment.from > high) break;
    const length = segment.to - segment.from;
    if (!length) continue;
    const a = Math.max(0, (low - segment.from) / length); const b = Math.min(1, (high - segment.from) / length);
    if (b <= a) continue;
    // One joined stroke, not independently capped line segments. A genuine gap starts
    // a new sheen; never invent a connector or show two competing highlights.
    if (part !== segment.part) { points = []; part = segment.part; }
    if (!points.length) points.push([...interpolateCoordinate([segment.start[0]!, segment.start[1]!], [segment.end[0]!, segment.end[1]!], a)]);
    points.push([...interpolateCoordinate([segment.start[0]!, segment.start[1]!], [segment.end[0]!, segment.end[1]!], b)]);
  }
  return { type: 'Feature', properties: { vimaSheenOpacity: Math.min(1, progress / width, (1 - progress) / width) },
    geometry: points.length >= 2 ? { type: 'LineString', coordinates: points } : { type: 'MultiLineString', coordinates: [] } };
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
