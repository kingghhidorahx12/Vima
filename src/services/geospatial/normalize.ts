import { normalizeBounds, normalizeCoordinate } from '../../map/models.ts';
import { GeospatialError, type PlaceSuggestion, type ResolvedPlace, type RouteResult } from './contracts.ts';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GeospatialError('invalid_result');
  return value as Record<string, unknown>;
}
function text(value: unknown, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim())) throw new GeospatialError('invalid_result');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new GeospatialError('invalid_result');
  return value;
}
export function decodeSession(value: unknown): string { return text(object(value).sessionId); }
export function decodeSuggestion(value: unknown): PlaceSuggestion {
  const v = object(value);
  if (v.provenance !== undefined && v.provenance !== 'provider' && v.provenance !== 'vima-local') throw new GeospatialError('invalid_result');
  if (v.kind !== undefined && v.kind !== 'action') throw new GeospatialError('invalid_result');
  return { id: text(v.id), name: text(v.name), address: text(v.address, true),
    ...(v.canonicalId === undefined ? {} : { canonicalId: text(v.canonicalId) }),
    ...(v.kind === 'action' ? { kind: 'action' as const } : {}),
    ...(v.provenance === undefined ? {} : { provenance: v.provenance }),
    ...(v.category === undefined ? {} : { category: text(v.category) }),
    ...(v.regionId === undefined ? {} : { regionId: text(v.regionId) }) };
}
export function decodeSuggestions(value: unknown): readonly PlaceSuggestion[] {
  const v = object(value);
  if (!Array.isArray(v.suggestions)) throw new GeospatialError('invalid_result');
  return v.suggestions.map(decodeSuggestion);
}
export function decodePlace(value: unknown): ResolvedPlace {
  try { return { ...decodeSuggestion(value), coordinate: normalizeCoordinate(object(value).coordinate) }; }
  catch { throw new GeospatialError('invalid_result'); }
}
export function decodeOptionalPlace(value: unknown): ResolvedPlace {
  const v = object(value);
  if (v.result === null) throw new GeospatialError('no_result');
  return decodePlace(v.result);
}
export function decodeRoute(value: unknown): RouteResult {
  try {
    const v = object(value);
    const feature = object(v.geometry);
    const geometry = object(feature.geometry);
    if (feature.type !== 'Feature' || !['LineString', 'MultiLineString'].includes(String(geometry.type)) ||
      !Array.isArray(geometry.coordinates)) throw new Error();
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    if (!lines.length) throw new Error();
    const normalized = lines.map((line: unknown) => {
      if (!Array.isArray(line) || line.length < 2) throw new Error();
      return line.map(point => [...normalizeCoordinate(point)]);
    });
    const bounds = normalizeBounds(v.bounds);
    const [west, south] = bounds.southwest; const [east, north] = bounds.northeast;
    for (const line of normalized) for (const [lng, lat] of line) {
      if (lat! < south || lat! > north || (west <= east ? lng! < west || lng! > east : lng! < west && lng! > east)) throw new Error();
    }
    // Reconstruct an allowlist; raw provider metadata/properties never pass into Vima.
    return {
      geometry: { type: 'Feature', properties: {}, geometry: geometry.type === 'LineString'
        ? { type: 'LineString', coordinates: normalized[0]! } : { type: 'MultiLineString', coordinates: normalized } },
      bounds, distanceMeters: number(v.distanceMeters), durationSeconds: number(v.durationSeconds),
      ...(v.trafficDurationSeconds === undefined ? {} : { trafficDurationSeconds: number(v.trafficDurationSeconds) }),
    };
  } catch { throw new GeospatialError('invalid_result'); }
}
