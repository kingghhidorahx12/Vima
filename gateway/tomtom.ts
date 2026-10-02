import { createHash, randomUUID } from 'node:crypto';
import { fitBounds, normalizeCoordinate, type Coordinate } from '../src/map/models.ts';
import { GeospatialError, type GeospatialErrorCode, type PlaceSuggestion, type ResolvedPlace, type RouteRequest } from '../src/services/geospatial/contracts.ts';
import { decodePlace, decodeRoute } from '../src/services/geospatial/normalize.ts';
import type { GatewayConfig } from './config.ts';
import { allowFields, record } from './validation.ts';
import type { DiscoverReference, PlaceReference, ProviderReference } from './state.ts';
import { regionForText } from '../src/services/geospatial/regionalRanking.ts';

const origin = 'https://api.tomtom.com';
const placeTypes = { poi: 'pois', address: 'addresses', street: 'streets', intersection: 'intersections', area: 'areas' } as const;
export interface UpstreamContext { signal: AbortSignal; sessionId?: string; status?: number }
export interface ProviderChoice { suggestion: PlaceSuggestion & { coordinate?: Coordinate; providerRef?: string }; reference: ProviderReference }
export const providerCanonicalId = (type: string, id: string) =>
  `tomtom:${createHash('sha256').update(`${type}:${id}`).digest('hex').slice(0, 32)}`;
export interface ProviderShape {
  kind: 'object' | 'array' | 'other';
  type: 'poi' | 'address' | 'street' | 'intersection' | 'area' | 'other';
  hasId: boolean; hasTitle: boolean; hasPosition: boolean; positionType?: 'Point' | 'other';
  hasAddress: boolean; hasSubtitles: boolean; hasDetailsLink: boolean;
}
export interface ProviderDiagnostic { operation: 'autocomplete' | 'search' | 'details'; results: readonly ProviderShape[] }
/** Bounded structural diagnostics only; never expose provider IDs, queries, addresses or coordinates. */
export function providerShape(value: unknown): ProviderShape {
  const kind = Array.isArray(value) ? 'array' : value && typeof value === 'object' ? 'object' : 'other';
  const item = kind === 'object' ? value as Record<string, unknown> : {};
  const type = typeof item.type === 'string' && item.type in placeTypes ? item.type as ProviderShape['type'] : 'other';
  const position = item.position && typeof item.position === 'object' && !Array.isArray(item.position)
    ? item.position as Record<string, unknown> : undefined;
  const more = item.more && typeof item.more === 'object' && !Array.isArray(item.more)
    ? item.more as Record<string, unknown> : undefined;
  return { kind, type, hasId: typeof item.id === 'string' && !!item.id,
    hasTitle: typeof item.title === 'string' && !!item.title,
    hasPosition: !!position, ...(position ? { positionType: position.type === 'Point' ? 'Point' as const : 'other' as const } : {}),
    hasAddress: !!item.address && typeof item.address === 'object' && !Array.isArray(item.address),
    hasSubtitles: Array.isArray(item.subtitles), hasDetailsLink: more?.operation === 'details' };
}
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
    regionId: regionForText(municipality || address) });
}
const locationTypes = Object.keys(placeTypes) as (keyof typeof placeTypes)[];
const areaTypes = ['country', 'countrySubdivision', 'countrySecondarySubdivision', 'countryTertiarySubdivision',
  'municipality', 'municipalitySubdivision', 'municipalitySecondarySubdivision', 'postalCode', 'neighborhood'] as const;
function detailsReference(value: Record<string, unknown>, type: keyof typeof placeTypes, id: string): PlaceReference {
  const more = value.more;
  if (more !== undefined) {
    const follow = record(more);
    if (follow.operation !== 'details' || !Array.isArray(follow.pathParameters)) throw new GeospatialError('invalid_result');
    const params = new Map<string, string>();
    for (const parameter of follow.pathParameters) {
      const item = record(parameter);
      if ((item.parameter !== 'type' && item.parameter !== 'id') || typeof item.argument !== 'string' || params.has(item.parameter))
        throw new GeospatialError('invalid_result');
      params.set(item.parameter, item.argument);
    }
    if (params.size !== 2 || params.get('type') !== placeTypes[type] || params.get('id') !== id)
      throw new GeospatialError('invalid_result');
  }
  return { kind: 'details', type: placeTypes[type], id };
}
function discoverReference(value: Record<string, unknown>): DiscoverReference {
  const more = record(value.more);
  if (more.operation !== 'discover') throw new GeospatialError('invalid_result');
  const body = allowFields(more.requestBody, ['query', 'filters']);
  const filters = body.filters === undefined ? {} : allowFields(body.filters,
    ['types', 'poiTypes', 'areaTypes', 'countryCodesIso2']);
  const types = filters.types;
  const poiTypes = filters.poiTypes;
  const selectedAreaTypes = filters.areaTypes;
  if (filters.countryCodesIso2 !== undefined && (!Array.isArray(filters.countryCodesIso2) ||
    !filters.countryCodesIso2.includes('MX'))) throw new GeospatialError('invalid_result');
  if ((typeof body.query !== 'string' || !body.query.trim()) && !Object.keys(filters).length)
    throw new GeospatialError('invalid_result');
  if (body.query !== undefined && (typeof body.query !== 'string' || body.query.length > 256)) throw new GeospatialError('invalid_result');
  if (types !== undefined && (!Array.isArray(types) || !types.length || !types.every(type => locationTypes.includes(type))))
    throw new GeospatialError('invalid_result');
  if (poiTypes !== undefined && (!Array.isArray(poiTypes) || !poiTypes.length || poiTypes.length > 20 ||
    !poiTypes.every(type => typeof type === 'string' && /^[a-z0-9_]{1,64}$/.test(type)))) throw new GeospatialError('invalid_result');
  if (selectedAreaTypes !== undefined && (!Array.isArray(selectedAreaTypes) || !selectedAreaTypes.length ||
    !selectedAreaTypes.every(type => areaTypes.includes(type)))) throw new GeospatialError('invalid_result');
  return { kind: 'discover', ...(body.query === undefined ? {} : { query: body.query as string }),
    ...(types === undefined ? {} : { types: types as DiscoverReference['types'] }),
    ...(poiTypes === undefined ? {} : { poiTypes: poiTypes as string[] }),
    ...(selectedAreaTypes === undefined ? {} : { areaTypes: selectedAreaTypes as string[] }) };
}
export function normalizeProviderSearch(value: unknown): ProviderChoice[] {
  const results = record(value).results;
  // Orbis Discover can return an empty response object when there are no matches.
  if (results === undefined && Object.keys(record(value)).length === 0) return [];
  if (!Array.isArray(results)) throw new GeospatialError('invalid_result');
  return results.flatMap((result): ProviderChoice[] => {
    const v = record(result);
    if (v.type === 'discoverAction') {
      const name = text(v.title);
      if (!name) throw new GeospatialError('invalid_result');
      return [{ suggestion: { id: randomUUID(), name, address: '', kind: 'action' as const, provenance: 'provider' as const },
        reference: discoverReference(v) }];
    }
    const type = v.type as keyof typeof placeTypes;
    if (!locationTypes.includes(type)) return [];
    const id = text(v.id); const name = text(v.title);
    if (!id || !name) throw new GeospatialError('invalid_result');
    const address = subtitles(v.subtitles) || addressLabel(v.address);
    const canonicalId = providerCanonicalId(placeTypes[type], id);
    let position: Coordinate | undefined;
    try { if (v.position !== undefined) position = normalizeCoordinate(record(v.position).coordinates); }
    catch { /* A Suggest item may omit a usable position; Details remains authoritative. */ }
    return [{ suggestion: { id: randomUUID(), canonicalId, providerRef: canonicalId, name, address, provenance: 'provider' as const,
      ...(position ? { coordinate: position } : {}), regionId: regionForText(address) }, reference: detailsReference(v, type, id) }];
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

export function createTomTomAdapter(key: string | undefined, config: GatewayConfig, fetcher: typeof fetch = fetch,
  diagnostic?: (event: ProviderDiagnostic) => void) {
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
        filters: { countryCodesIso2: ['MX'], types: autocomplete ? [...locationTypes, 'discoverAction'] : locationTypes },
        ...(bias ? { origin: { type: 'point', coordinates: bias }, preferences: { geometry: { type: 'point', coordinates: bias } } } : {}) };
      const response = await request('/maps/orbis/places/' + (autocomplete ? 'suggest' : 'discover'), 3,
        'results(id,type,title,subtitles,more)', context, 'search_unavailable', body);
      if (diagnostic) {
        const results = response && typeof response === 'object' ? (response as Record<string, unknown>).results : undefined;
        diagnostic({ operation: autocomplete ? 'autocomplete' : 'search',
          results: Array.isArray(results) ? results.slice(0, config.maxResults).map(providerShape) : [providerShape(results)] });
      }
      return normalizeProviderSearch(response);
    },
    async followDiscover(reference: DiscoverReference, bias: Coordinate | undefined, context: UpstreamContext) {
      if (reference.kind !== 'discover') throw new GeospatialError('invalid_result');
      const body = { ...(reference.query === undefined ? {} : { query: reference.query }), maxResults: config.maxResults,
        filters: { countryCodesIso2: ['MX'], ...(reference.types ? { types: reference.types } : {}),
          ...(reference.poiTypes ? { poiTypes: reference.poiTypes } : {}),
          ...(reference.areaTypes ? { areaTypes: reference.areaTypes } : {}) },
        ...(bias ? { origin: { type: 'point', coordinates: bias }, preferences: { geometry: { type: 'point', coordinates: bias } } } : {}) };
      const response = await request('/maps/orbis/places/discover', 3, 'results(id,type,title,subtitles,more)',
        context, 'search_unavailable', body);
      return normalizeProviderSearch(response);
    },
    async resolve(reference: PlaceReference, context: UpstreamContext) {
      if (reference.kind !== 'details' || !Object.values(placeTypes).includes(reference.type)) throw new GeospatialError('invalid_result');
      const response = await request(`/maps/orbis/places/details/${reference.type}/${encodeURIComponent(reference.id)}`,
        3, 'id,type,title,subtitles,position,address', context, 'search_unavailable');
      diagnostic?.({ operation: 'details', results: [providerShape(response)] });
      return normalizeProviderPlace(response);
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
