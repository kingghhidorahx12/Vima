import { randomUUID } from 'node:crypto';
import { fitBounds, type Coordinate } from '../src/map/models.ts';
import { GeospatialError, type GeospatialErrorCode, type PlaceSuggestion, type ResolvedPlace, type RouteRequest } from '../src/services/geospatial/contracts.ts';
import { decodePlace, decodeRoute } from '../src/services/geospatial/normalize.ts';
import type { GatewayConfig } from './config.ts';
import { record } from './validation.ts';
import type { PlaceReference } from './state.ts';
import { regionForText } from '../src/services/geospatial/regionalRanking.ts';

const origin = 'https://api.tomtom.com';
const placeTypes = { poi: 'pois', address: 'addresses', street: 'streets', intersection: 'intersections', area: 'areas' } as const;
export interface UpstreamContext { signal: AbortSignal; sessionId?: string; status?: number }
export interface ProviderChoice { suggestion: PlaceSuggestion; reference: PlaceReference }
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const subtitles = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').join(', ') : '';
function addressLabel(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const v = record(value);
  return [text(v.street), text(v.houseNumber), text(v.municipalitySubdivision), text(v.municipality), text(v.countrySubdivision)]
    .filter(Boolean).join(', ');
}
export function normalizeProviderPlace(value: unknown): ResolvedPlace {
  const v = record(value);
  const address = subtitles(v.subtitles) || addressLabel(v.address);
  const municipality = v.address && typeof v.address === 'object' ? text(record(v.address).municipality) : '';
  return decodePlace({ id: text(v.id), name: text(v.title), address,
    coordinate: record(v.position).coordinates, provenance: 'provider',
    category: text(v.type) || 'place', regionId: regionForText(municipality || address) });
}
export function normalizeProviderSearch(value: unknown): ProviderChoice[] {
  const results = record(value).results;
  if (!Array.isArray(results)) throw new GeospatialError('invalid_result');
  return results.flatMap(result => {
    const v = record(result);
    const type = placeTypes[v.type as keyof typeof placeTypes];
    // Discover actions are categories, not selectable destinations with a coordinate.
    if (!type) return [];
    const id = text(v.id); const name = text(v.title);
    if (!id || !name) throw new GeospatialError('invalid_result');
    const address = subtitles(v.subtitles) || addressLabel(v.address);
    return [{ suggestion: { id: randomUUID(), name, address, category: text(v.type), provenance: 'provider' as const,
      regionId: regionForText(address) }, reference: { type, id } }];
  });
}
export function normalizeProviderRoute(value: unknown) {
  const routes = record(value).routes;
  if (!Array.isArray(routes)) throw new GeospatialError('invalid_result');
  if (!routes.length) throw new GeospatialError('no_result');
  const route = record(routes[0]); const summary = record(route.summary);
  if (!Array.isArray(route.legs) || !route.legs.length) throw new GeospatialError('invalid_result');
  const lines = route.legs.map(leg => {
    const path = record(record(leg).path);
    if (path.type !== 'LineString' || !Array.isArray(path.coordinates) || path.coordinates.length < 2) throw new GeospatialError('invalid_result');
    return path.coordinates as Coordinate[];
  });
  let bounds: ReturnType<typeof fitBounds>;
  try {
    const points = lines.flat(); bounds = fitBounds(points);
    // fitBounds normalizes longitude modulo 360. Restore exact input edge coordinates
    // so IEEE-754 roundoff cannot put a route vertex just outside its own bounds.
    for (const edge of [0, 2]) bounds[edge] = points.find(point => Math.abs(point[0] - bounds[edge]!) < 1e-10)?.[0] ?? bounds[edge]!;
  } catch { throw new GeospatialError('invalid_result'); }
  const live = summary.travelDurationInSeconds; const delay = summary.trafficDelayDurationInSeconds;
  if (typeof live !== 'number' || typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0 || delay > live)
    throw new GeospatialError('invalid_result');
  return decodeRoute({ geometry: { type: 'Feature', properties: {}, geometry: lines.length === 1
    ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines } },
    bounds: { southwest: bounds.slice(0, 2), northeast: bounds.slice(2) },
    distanceMeters: summary.lengthInMeters, durationSeconds: live - delay, trafficDurationSeconds: live });
}

export function createTomTomAdapter(key: string | undefined, config: GatewayConfig, fetcher: typeof fetch = fetch) {
  async function request(path: string, version: number, attributes: string, context: UpstreamContext,
    unavailable: GeospatialErrorCode, body?: unknown) {
    if (!key?.trim()) throw new GeospatialError(unavailable);
    const controller = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.upstreamTimeoutMs);
    const signal = AbortSignal.any([context.signal, controller.signal]);
    try {
      const response = await fetcher(origin + path, { method: body === undefined ? 'GET' : 'POST', signal,
        redirect: 'error', headers: { 'TomTom-Api-Key': key, 'TomTom-Api-Version': String(version),
          Attributes: attributes, 'Accept-Language': 'es-MX', Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(context.sessionId ? { 'Session-Id': context.sessionId } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      context.status = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 404) throw new GeospatialError('no_result');
        if (response.status === 408 || response.status === 504) throw new GeospatialError('timeout');
        if (response.status === 429) throw new GeospatialError('network_recoverable');
        throw new GeospatialError(unavailable);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new GeospatialError('invalid_result');
      let size = 0; const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > config.maxUpstreamBytes) { await reader.cancel(); throw new GeospatialError('invalid_result'); }
        chunks.push(value);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
      catch { throw new GeospatialError('invalid_result'); }
    } catch (error) {
      if (timedOut) throw new GeospatialError('timeout');
      if (context.signal.aborted) throw new GeospatialError('cancelled');
      if (error instanceof GeospatialError) throw error;
      throw new GeospatialError(error instanceof TypeError ? 'network_recoverable' : unavailable);
    } finally { clearTimeout(timer); }
  }
  return {
    async search(input: string, bias: Coordinate | undefined, autocomplete: boolean, context: UpstreamContext) {
      const body = { query: input, maxResults: config.maxResults,
        filters: { countryCodesIso2: ['MX'], types: ['poi', 'address', 'street', 'intersection', 'area'] },
        ...(bias ? { origin: { type: 'point', coordinates: bias }, preferences: { geometry: { type: 'point', coordinates: bias } } } : {}) };
      return normalizeProviderSearch(await request('/maps/orbis/places/' + (autocomplete ? 'suggest' : 'discover'), 3,
        'results(id,type,title,subtitles)', context, 'search_unavailable', body));
    },
    async resolve(reference: PlaceReference, context: UpstreamContext) {
      if (!Object.values(placeTypes).includes(reference.type)) throw new GeospatialError('invalid_result');
      return normalizeProviderPlace(await request(`/maps/orbis/places/details/${reference.type}/${encodeURIComponent(reference.id)}`,
        3, 'id,type,title,subtitles,position,address', context, 'search_unavailable'));
    },
    async geocode(input: string, bias: Coordinate | undefined, context: UpstreamContext) {
      const params = new URLSearchParams({ query: input, countryCodesIso2: 'MX', maxResults: '1' });
      if (bias) params.set('position', bias.join(','));
      const value = await request('/maps/orbis/places/geocode?' + params, 2, 'results(id,type,title,position,address)', context, 'geocoding_unavailable');
      const results = record(value).results;
      if (!Array.isArray(results)) throw new GeospatialError('invalid_result');
      return results.length ? normalizeProviderPlace(results[0]) : null;
    },
    async reverse(coordinate: Coordinate, context: UpstreamContext) {
      const params = new URLSearchParams({ position: coordinate.join(',') });
      const value = await request('/maps/orbis/places/reverseGeocode?' + params, 2,
        'results(id,type,title,position,address)', context, 'geocoding_unavailable');
      const results = record(value).results;
      if (!Array.isArray(results)) throw new GeospatialError('invalid_result');
      return results.length ? normalizeProviderPlace(results[0]) : null;
    },
    async route(input: RouteRequest, context: UpstreamContext) {
      const point = (coordinate: Coordinate) => ({ type: 'Point', coordinates: coordinate });
      return normalizeProviderRoute(await request('/maps/orbis/routing/routes/calculate', 3,
        'routes(summary(lengthInMeters,travelDurationInSeconds,trafficDelayDurationInSeconds),legs.path)', context, 'route_unavailable',
        { routePlanningLocations: { origin: point(input.origin), destination: point(input.destination),
          ...(input.stops.length ? { waypoints: { type: 'MultiPoint', coordinates: input.stops } } : {}) },
          travelMode: 'car', traffic: 'live', maxPathAlternativeRoutes: 0 }));
    },
  };
}
export type TomTomAdapter = ReturnType<typeof createTomTomAdapter>;
