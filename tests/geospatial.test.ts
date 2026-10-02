import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { normalizeCoordinate, normalizeBounds, fitBounds } from '../src/map/models.ts';
import { decodeRoute, decodePlace } from '../src/services/geospatial/normalize.ts';
import { createGeospatialClient } from '../src/services/geospatial/client.ts';
import { createPlaceSearch } from '../src/services/geospatial/search.ts';
import { GeospatialError } from '../src/services/geospatial/contracts.ts';
import { ApiError, type ApiClient, type ApiRequest } from '../src/services/api/client.ts';
import { approvedLocalPlaces, mergePlaces } from '../src/services/geospatial/localPlaces.ts';

test('Vima Coordinate/Bounds reject invalid data and preserve explicit dateline bounds', () => {
  assert.deepEqual(normalizeCoordinate([-99, 19]), [-99, 19]);
  for (const value of [[181, 0], [0, 91], [NaN, 0], ['1', 0], [1, 2, 3], null]) assert.throws(() => normalizeCoordinate(value));
  assert.deepEqual(normalizeBounds({ southwest: [170, -10], northeast: [-170, 10], raw: true }),
    { southwest: [170, -10], northeast: [-170, 10] });
  assert.throws(() => normalizeBounds({ southwest: [0, 20], northeast: [1, 10] }));
});

test('MapLibre fit preserves longitude order, route extent and dateline short arc', () => {
  assert.deepEqual(fitBounds([[-99, 19], [-98, 20], [-97, 18]]), [-99, 18, -97, 20]);
  assert.deepEqual(fitBounds([[179, 1], [-179, 2]]), [179, 1, -179, 2]);
  assert.throws(() => fitBounds([]));
});

const routePayload = {
  geometry: { type: 'Feature', properties: { providerRaw: 'discard' }, geometry: { type: 'LineString', coordinates: [[-99, 19], [-98, 20]] } },
  bounds: { southwest: [-99, 19], northeast: [-98, 20] }, distanceMeters: 1234, durationSeconds: 180,
  trafficDurationSeconds: 240, raw: 'discard',
};
test('backend responses are normalized, with no raw properties retained or invented successful route', () => {
  const result = decodeRoute(routePayload);
  assert.deepEqual(result.geometry.properties, {});
  assert.equal('raw' in result, false);
  assert.equal(result.trafficDurationSeconds, 240);
  for (const bad of [{}, { ...routePayload, distanceMeters: -1 }, { ...routePayload, bounds: { southwest: [0, 0], northeast: [1, 1] } },
    { ...routePayload, geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } } }]) {
    assert.throws(() => decodeRoute(bad), (error: unknown) => error instanceof GeospatialError && error.code === 'invalid_result');
  }
  assert.deepEqual(decodePlace({ id: 'vima-place', name: 'Lugar', address: 'Dirección', coordinate: [-99, 19], raw: true }),
    { id: 'vima-place', name: 'Lugar', address: 'Dirección', coordinate: [-99, 19] });
});

function apiWith(handler: (input: ApiRequest<unknown>) => unknown): ApiClient {
  return { async request<T>(input: ApiRequest<T>) { return input.decode(await handler(input)); } };
}
test('Places session spans autocomplete calls, resolves once and cannot be reused; routes use Vima backend only', async () => {
  const calls: ApiRequest<unknown>[] = [];
  const api = apiWith(input => {
    calls.push(input);
    if (input.path.endsWith('/sessions')) return { sessionId: 'opaque-session' };
    if (input.path.endsWith('/autocomplete') || input.path.endsWith('/search')) return { suggestions: [{ id: 'p', name: 'Lugar', address: 'Dirección' }] };
    if (input.path.endsWith('/resolve')) return { id: 'p', name: 'Lugar', address: 'Dirección', coordinate: [-99, 19] };
    return routePayload;
  });
  const client = createGeospatialClient(api, 1000);
  const session = await client.startPlacesSession();
  await session.autocomplete('lu'); await session.autocomplete('lugar'); await session.search('lugar');
  await session.resolve('p');
  assert.throws(() => session.autocomplete('again'), /search_unavailable/);
  await assert.rejects(() => session.resolve('p'), /search_unavailable/);
  await session.close();
  const result = await client.route({ origin: [-99, 19], destination: [-98, 20], stops: [] });
  assert.equal(result.distanceMeters, 1234);
  assert.equal(calls.length, 6);
  assert.ok(calls.every(c => c.path.startsWith('/v1/geospatial/')));
  assert.deepEqual(calls[4]!.body, { id: 'p' });
  const cancelled = await client.startPlacesSession();
  await cancelled.close();
  assert.equal(calls.at(-1)!.method, 'DELETE');
});

test('mobile search selects Suggest directly, while explicit submit and action follow-up use Discover in one Vima session', async () => {
  const paths: string[] = [];
  const client = createGeospatialClient(apiWith(input => {
    paths.push(input.path);
    if (input.path.endsWith('/sessions')) return { sessionId: 'opaque-session' };
    if (input.path.endsWith('/autocomplete')) return { suggestions: [{ id: 'action', name: 'Universidades', address: '', kind: 'action' },
      { id: 'uaem', name: 'Centro Universitario UAEM Atlacomulco', address: 'Atlacomulco', provenance: 'provider' }] };
    if (input.path.endsWith('/follow-up') || input.path.endsWith('/search')) return { suggestions: [
      { id: 'place', name: 'Lugar', address: 'Atlacomulco', provenance: 'provider' }] };
    if (input.path.endsWith('/resolve')) return { id: 'uaem', name: 'Centro Universitario UAEM Atlacomulco',
      address: 'Atlacomulco', coordinate: [-99.84, 19.76] };
    return {};
  }), 1000);
  const search = createPlaceSearch(client, 0);
  const suggested = await search.suggest('UAEM');
  assert.equal(suggested[0]!.kind, 'action');
  assert.equal((await search.followUp(suggested[0]!.id))[0]!.name, 'Lugar');
  assert.equal((await search.search('texto completo'))[0]!.name, 'Lugar');
  const selected = await search.resolve(suggested[1]!.id);
  assert.equal(selected.name, 'Centro Universitario UAEM Atlacomulco');
  assert.deepEqual(paths.map(path => path.split('/').at(-1)), ['sessions', 'autocomplete', 'follow-up', 'search', 'resolve']);
});

test('forward and reverse geocoding stay behind the Vima API and normalize no-result', async () => {
  const calls: ApiRequest<unknown>[] = [];
  const client = createGeospatialClient(apiWith(input => { calls.push(input); return { result: {
    id: 'address-1', name: 'Dirección', address: 'Atlacomulco', coordinate: [-99.87, 19.8],
    provenance: 'provider', raw: 'discard',
  } }; }), 1000);
  assert.equal((await client.geocode('Dirección')).address, 'Atlacomulco');
  assert.deepEqual(await client.reverseGeocode([-99.87, 19.8]), {
    id: 'address-1', name: 'Dirección', address: 'Atlacomulco', coordinate: [-99.87, 19.8], provenance: 'provider',
  });
  assert.deepEqual(calls.map(call => call.path), ['/v1/geospatial/geocode', '/v1/geospatial/reverse-geocode']);
  assert.deepEqual(calls[1]!.body, { coordinate: [-99.87, 19.8] });
  const missing = createGeospatialClient(apiWith(() => ({ result: null })), 1000);
  await assert.rejects(missing.geocode('unknown'), { message: 'no_result' });
  await assert.rejects(missing.reverseGeocode([0, 0]), { message: 'no_result' });
});

test('local places include only the two reviewed public entries and regional rank requires supplied calibration', () => {
  assert.deepEqual(approvedLocalPlaces.map(place => place.status), ['verified', 'verified']);
  const provider = [{ id: 'remote', name: 'Intermunicipal', address: '', coordinate: [-100, 20] as const,
    provenance: 'provider' as const, regionId: 'other' }];
  const local = [{ id: 'local', name: 'Local validado', address: '', coordinate: [-99.87, 19.8] as const,
    provenance: 'vima-local' as const, regionId: 'atlacomulco', canonicalName: 'Local validado', status: 'verified' as const }];
  assert.deepEqual(mergePlaces(provider, local), [...provider, ...local]);
  assert.deepEqual(mergePlaces(provider, local, { origin: [-99.87, 19.8], initialRegionId: 'atlacomulco',
    nearbyRegionIds: [], distanceWeight: 1, initialRegionBoost: 1, nearbyRegionBoost: 0 }), [local[0], provider[0]]);
  assert.deepEqual(mergePlaces([...provider, ...provider], local).length, 2);
  assert.throws(() => mergePlaces(provider, local, { origin: [0, 0], initialRegionId: 'atlacomulco',
    nearbyRegionIds: [], distanceWeight: -1, initialRegionBoost: 0, nearbyRegionBoost: 0 }));
});

test('geospatial transport sanitizes provider failures, timeout, cancellation and bad 2xx', async () => {
  for (const [error, expected] of [[new ApiError(503), 'route_unavailable'], [new ApiError(504), 'timeout'],
    [new TypeError('raw network detail'), 'network_recoverable'], [new Error('raw provider detail'), 'route_unavailable']] as const) {
    const client = createGeospatialClient(apiWith(() => { throw error; }), 1000);
    await assert.rejects(client.route({ origin: [-99, 19], destination: [-98, 20], stops: [] }), { message: expected });
  }
  const timeout = createGeospatialClient(apiWith(() => new Promise(() => {})), 5);
  await assert.rejects(timeout.startPlacesSession(), { message: 'timeout' });
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(timeout.startPlacesSession(cancelled.signal), { message: 'cancelled' });
  const invalid = createGeospatialClient(apiWith(() => ({})), 1000);
  await assert.rejects(invalid.route({ origin: [-99, 19], destination: [-98, 20], stops: [] }), { message: 'invalid_result' });
});

test('feature boundaries contain no native provider types or server credentials', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(dir + '/' + entry.name) : [dir + '/' + entry.name]);
  const features = files('src/features').filter(f => /\.tsx?$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(features, /@maplibre|from ['"]react-native-maps|google\.maps/);
  const mobile = [...files('src'), ...files('app'), 'app.config.ts'].filter(f => /\.tsx?$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(mobile, /from ['"]react-native-maps|require\(['"]react-native-maps|PROVIDER_GOOGLE|GOOGLE_MAPS_ANDROID_API_KEY|EXPO_PUBLIC_GOOGLE_MAP_ID/);
  assert.doesNotMatch(mobile, /\bTOMTOM_API_KEY\b|api\.tomtom\.com\/maps\/orbis\/(places|routing)/);
  assert.match(readFileSync('src/map/VimaMap.tsx', 'utf8'), /TomTom-Api-Key/);
  assert.match(readFileSync('src/map/VimaMap.tsx', 'utf8'), /api\\\.tomtom\\\.com\\\/maps\\\/orbis/);
  assert.doesNotMatch(mobile, /GOOGLE_PLACES_API_KEY|GOOGLE_ROUTES_API_KEY|places\.googleapis\.com|routes\.googleapis\.com/);
  assert.doesNotMatch(mobile, /AIza[\w-]{30,}/);
  assert.match(readFileSync('src/map/VimaMap.tsx', 'utf8'), /@maplibre/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.dependencies['@maplibre/maplibre-react-native']);
  assert.equal(pkg.dependencies['react-native-maps'], undefined);
  const config = readFileSync('app.config.ts', 'utf8');
  assert.doesNotMatch(config, /GOOGLE_MAPS|googleMaps|with-google/);
});
