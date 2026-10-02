import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolveMapProvider, optionalGoogleMapId } from '../src/map/provider.ts';
import { normalizeCoordinate, normalizeBounds } from '../src/map/models.ts';
import { googleCameraCommand } from '../src/map/google/camera.ts';
import { decodeRoute, decodePlace } from '../src/services/geospatial/normalize.ts';
import { createGeospatialClient } from '../src/services/geospatial/client.ts';
import { GeospatialError } from '../src/services/geospatial/contracts.ts';
import { ApiError, type ApiClient, type ApiRequest } from '../src/services/api/client.ts';

test('Android selects Google when configured; release never silently rolls back without key', () => {
  assert.equal(resolveMapProvider('android', true, true), 'google');
  assert.equal(resolveMapProvider('android', true, false), 'google');
  assert.equal(resolveMapProvider('android', false, true), 'maplibre');
  assert.throws(() => resolveMapProvider('android', false, false), /required/);
  assert.equal(resolveMapProvider('ios', false, false), 'maplibre');
  assert.equal(optionalGoogleMapId('  '), undefined);
  assert.equal(optionalGoogleMapId(undefined), undefined);
  assert.equal(optionalGoogleMapId(' example-map-id '), 'example-map-id');
});

test('Vima Coordinate/Bounds reject invalid data and preserve explicit dateline bounds', () => {
  assert.deepEqual(normalizeCoordinate([-99, 19]), [-99, 19]);
  for (const value of [[181, 0], [0, 91], [NaN, 0], ['1', 0], [1, 2, 3], null]) assert.throws(() => normalizeCoordinate(value));
  assert.deepEqual(normalizeBounds({ southwest: [170, -10], northeast: [-170, 10], raw: true }),
    { southwest: [170, -10], northeast: [-170, 10] });
  assert.throws(() => normalizeBounds({ southwest: [0, 20], northeast: [1, 10] }));
});

test('Google camera swaps coordinate axes, fits route/bounds and disables animation for Reduced Motion', () => {
  const target = { center: [-99, 19] as const, zoom: 14, bearing: 45, padding: { bottom: 320 } };
  const motion = { duration: 300, easing: 'ease' as const };
  const jump = googleCameraCommand(target, true, motion);
  assert.equal(jump.kind, 'camera');
  if (jump.kind === 'camera') {
    assert.equal(jump.animated, false);
    assert.deepEqual(jump.camera, { center: { latitude: 19, longitude: -99 }, zoom: 14, heading: 45 });
  }
  assert.equal(googleCameraCommand(target, false, motion).animated, true);
  assert.equal(googleCameraCommand(target, false).animated, false);
  const fit = googleCameraCommand({ coordinates: [[-99, 19], [-98, 20]], padding: { bottom: 320 } }, true, motion);
  assert.equal(fit.kind, 'fit');
  if (fit.kind === 'fit') {
    assert.equal(fit.options.animated, false);
    assert.equal(fit.options.edgePadding.bottom, 0); // MapView owns sheet padding.
    assert.deepEqual(fit.coordinates, [{ longitude: -99, latitude: 19 }, { longitude: -98, latitude: 20 }]);
  }
  const bounds = googleCameraCommand({ bounds: { southwest: [-99, 19], northeast: [-98, 20] } }, false);
  assert.equal(bounds.kind, 'fit');
  assert.throws(() => googleCameraCommand({ coordinates: [] }, false));
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
    if (input.path.endsWith('/autocomplete')) return { suggestions: [{ id: 'p', name: 'Lugar', address: 'Dirección' }] };
    if (input.path.endsWith('/resolve')) return { id: 'p', name: 'Lugar', address: 'Dirección', coordinate: [-99, 19] };
    return routePayload;
  });
  const client = createGeospatialClient(api, 1000);
  const session = await client.startPlacesSession();
  await session.autocomplete('lu'); await session.autocomplete('lugar');
  await session.resolve('p');
  assert.throws(() => session.autocomplete('again'), /search_unavailable/);
  await assert.rejects(() => session.resolve('p'), /search_unavailable/);
  await session.close();
  const result = await client.route({ origin: [-99, 19], destination: [-98, 20], stops: [] });
  assert.equal(result.distanceMeters, 1234);
  assert.equal(calls.length, 5);
  assert.ok(calls.every(c => c.path.startsWith('/v1/geospatial/')));
  assert.deepEqual(calls[3]!.body, { id: 'p' });
  const cancelled = await client.startPlacesSession();
  await cancelled.close();
  assert.equal(calls.at(-1)!.method, 'DELETE');
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

test('feature boundaries contain no native provider types; legacy remains and server credentials never enter mobile code', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(dir + '/' + entry.name) : [dir + '/' + entry.name]);
  const features = files('src/features').filter(f => /\.tsx?$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(features, /@maplibre|from ['"]react-native-maps|google\.maps/);
  const mobile = [...files('src'), ...files('app'), 'app.config.ts'].filter(f => /\.tsx?$/.test(f)).map(f => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(mobile, /GOOGLE_PLACES_API_KEY|GOOGLE_ROUTES_API_KEY|places\.googleapis\.com|routes\.googleapis\.com/);
  assert.doesNotMatch(mobile, /AIza[\w-]{30,}/);
  assert.match(readFileSync('src/map/legacy/VimaMap.tsx', 'utf8'), /@maplibre/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.dependencies['@maplibre/maplibre-react-native']);
  assert.equal(pkg.dependencies['react-native-maps'], '1.27.2');
  const config = readFileSync('app.config.ts', 'utf8');
  assert.match(config, /process\.env\.GOOGLE_MAPS_ANDROID_API_KEY/);
  assert.doesNotMatch(config, /EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY/);
});
