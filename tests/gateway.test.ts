import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { gatewayConfig } from '../gateway/config.ts';
import { createGateway, type GatewayLog } from '../gateway/server.ts';
import { createGatewayState } from '../gateway/state.ts';
import { createTomTomAdapter, normalizeProviderRoute, normalizeProviderSearch } from '../gateway/tomtom.ts';
import { allowFields, query, routeRequest } from '../gateway/validation.ts';
import { createApiClient } from '../src/services/api/client.ts';
import { createGeospatialClient } from '../src/services/geospatial/client.ts';
import { localPlaces } from '../gateway/places.ts';

const config = gatewayConfig({});
const position = [-99.88795, 19.79021];
const other = [-99.84073, 19.76183];
const providerPlace = { id: 'provider-test-id', type: 'poi', title: 'Plaza Atlacomulco',
  subtitles: ['Vial Jorge Jiménez Cantú, Atlacomulco'], position: { type: 'Point', coordinates: position },
  address: { street: 'Vial Jorge Jiménez Cantú', municipality: 'Atlacomulco' }, unused: 'must-not-reach-client' };
const providerRoute = { routes: [{ summary: { lengthInMeters: 6200, travelDurationInSeconds: 780, trafficDelayDurationInSeconds: 120 },
  legs: [{ path: { type: 'LineString', coordinates: [position, other] } }] }] };
const context = () => ({ signal: new AbortController().signal });

test('gateway validates empty/oversize queries, coordinates, waypoints and unknown parameters', () => {
  for (const input of ['', '  ', 'x'.repeat(257), '\u0000', 1]) assert.throws(() => query(input, config), /invalid_result/);
  assert.throws(() => allowFields({ url: 'https://example.org' }, ['input']), /invalid_result/);
  for (const bad of [[181, 0], [0, 91], [0], ['1', 2], [NaN, 2]]) {
    assert.throws(() => routeRequest({ origin: bad, destination: other, stops: [] }, config));
  }
  assert.throws(() => routeRequest({ origin: position, destination: other, stops: Array(11).fill(position) }, config));
  assert.throws(() => routeRequest({ origin: position, destination: other, stops: {} }, config));
  assert.deepEqual(routeRequest({ origin: position, destination: other, stops: [position] }, config).stops, [position]);
});

test('session lifecycle TTL, activity, cleanup, capacity and rate windows are deterministic', () => {
  let now = 0; const state = createGatewayState({ ...config, sessionTtlMs: 20, maxSessions: 1, rateWindowMs: 10, rateLimit: 2 }, () => now);
  const first = state.create(); assert.match(first.id, /^[a-f\d-]{36}$/);
  assert.throws(() => state.create(), /network_recoverable/);
  now = 19; assert.equal(state.get(first.id).lastActivity, 19);
  now = 38; assert.equal(state.get(first.id).createdAt, 0);
  now = 58; state.cleanup(); assert.throws(() => state.get(first.id), /no_result/);
  const next = state.create(); state.close(next.id); assert.throws(() => state.get(next.id), /no_result/);
  assert.equal(state.allow('client'), true); assert.equal(state.allow('client'), true); assert.equal(state.allow('client'), false);
  now += 10; assert.equal(state.allow('client'), true);
});

test('real adapter paths/versions/body bias normalize Search, Details, Geocode, Reverse and live Route', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const adapter = createTomTomAdapter(randomUUID(), config, async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(String(url).includes('routing') ? providerRoute : String(url).includes('details') ? providerPlace : { results: [providerPlace] });
  });
  const ctx = { ...context(), sessionId: randomUUID() };
  const suggestions = await adapter.search('Plaza', position as [number, number], true, ctx);
  assert.equal(suggestions[0]!.suggestion.provenance, 'provider');
  assert.notEqual(suggestions[0]!.suggestion.id, providerPlace.id);
  assert.equal('coordinate' in suggestions[0]!.suggestion, false);
  const first = calls[0]!; const body = JSON.parse(String(first.options!.body));
  assert.deepEqual(body.preferences.geometry, { type: 'point', coordinates: position });
  assert.deepEqual(body.filters.countryCodesIso2, ['MX']); assert.equal(body.radius, undefined);
  assert.equal(new Headers(first.options!.headers).get('TomTom-Api-Version'), '3');
  assert.equal(new Headers(first.options!.headers).get('Session-Id'), ctx.sessionId);
  await adapter.search('Plaza', undefined, false, ctx);
  assert.equal('preferences' in JSON.parse(String(calls[1]!.options!.body)), false);
  const place = await adapter.resolve(suggestions[0]!.reference, ctx);
  assert.deepEqual(place.coordinate, position); assert.equal(place.regionId, 'atlacomulco');
  assert.equal('unused' in place, false);
  const geocode = await adapter.geocode('address', position as [number, number], context());
  const reverse = await adapter.reverse(position as [number, number], context());
  assert.deepEqual(geocode, reverse);
  assert.equal(new Headers(calls[3]!.options!.headers).get('TomTom-Api-Version'), '2');
  assert.ok(calls[4]!.url.includes('/reverseGeocode?position='));
  const route = await adapter.route({ origin: position as [number, number], destination: other as [number, number], stops: [] }, context());
  assert.equal(route.durationSeconds, 660); assert.equal(route.trafficDurationSeconds, 780);
  assert.equal(route.distanceMeters, 6200); assert.equal(route.geometry.geometry.type, 'LineString');
  assert.deepEqual(route.bounds.southwest, [position[0], other[1]]);
  const routeBody = JSON.parse(String(calls[5]!.options!.body));
  assert.equal(routeBody.traffic, 'live'); assert.equal(routeBody.travelMode, 'car'); assert.equal(routeBody.maxPathAlternativeRoutes, 0);
  for (const call of calls) assert.equal(new URL(call.url).origin, 'https://api.tomtom.com');
});

test('normalization rejects malformed geometry/traffic and omits nonselectable search actions', () => {
  assert.deepEqual(normalizeProviderSearch({ results: [{ type: 'category', title: 'category' }] }), []);
  assert.throws(() => normalizeProviderSearch({ results: 'invalid' }), /invalid_result/);
});

test('routing rejects invalid geometry, negative traffic and missing summaries', () => {
  for (const value of [{}, { routes: [] }, { routes: [{ legs: [], summary: {} }] },
    { routes: [{ ...providerRoute.routes[0], summary: { lengthInMeters: 1, travelDurationInSeconds: 2, trafficDelayDurationInSeconds: 3 } }] },
    { routes: [{ ...providerRoute.routes[0], legs: [{ path: { type: 'LineString', coordinates: [[200, 0], [0, 0]] } }] }] }]) {
    assert.throws(() => normalizeProviderRoute(value));
  }
  assert.throws(() => normalizeProviderSearch({ results: [{ type: 'poi' }] }), /invalid_result/);
});

test('adapter maps upstream statuses, timeout and abort without retaining upstream secrets', async () => {
  const sensitive = randomUUID();
  for (const [status, code] of [[401, 'search_unavailable'], [403, 'search_unavailable'], [404, 'no_result'], [429, 'network_recoverable'], [500, 'search_unavailable'], [504, 'timeout']] as const) {
    const adapter = createTomTomAdapter(sensitive, config, async () => new Response(sensitive, { status }));
    await assert.rejects(adapter.search('test', undefined, true, context()), error => error instanceof Error && error.message === code && !String(error).includes(sensitive));
  }
  const stalled: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error(sensitive)), { once: true });
  });
  await assert.rejects(createTomTomAdapter(sensitive, { ...config, upstreamTimeoutMs: 5 }, stalled).search('test', undefined, true, context()), /timeout/);
  const controller = new AbortController();
  const request = createTomTomAdapter(sensitive, config, stalled).search('test', undefined, true, { signal: controller.signal });
  controller.abort(); await assert.rejects(request, /cancelled/);
  await assert.rejects(createTomTomAdapter(undefined, config).search('test', undefined, true, context()), /search_unavailable/);
});

test('HTTP gateway/client integration resolves opaque sessions, local merge, limits and sanitized logs', async () => {
  const logs: GatewayLog[] = []; const sensitive = randomUUID();
  const adapter = createTomTomAdapter(sensitive, config, async url => Response.json(String(url).includes('details') ? providerPlace :
    String(url).includes('routing') ? providerRoute : { results: [providerPlace] }));
  const server = createGateway({ ...config, rateLimit: 14 }, adapter, { localPlaces, logger: entry => logs.push(entry) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const client = createGeospatialClient(createApiClient(base, async () => null, { development: true }), 2000);
  try {
    assert.equal((await fetch(base + '/health')).status, 200);
    const session = await client.startPlacesSession();
    const found = await session.autocomplete('Plaza Atlacomulco');
    assert.equal(found.length, 1); // verified local duplicate not shown twice
    assert.equal((await session.resolve(found[0]!.id)).name, 'Plaza Atlacomulco');
    assert.throws(() => session.autocomplete('Plaza'), /search_unavailable/);
    assert.equal((await client.geocode('address')).regionId, 'atlacomulco');
    assert.equal((await client.reverseGeocode(position as [number, number])).regionId, 'atlacomulco');
    assert.equal((await client.route({ origin: position as [number, number], destination: other as [number, number], stops: [] })).trafficDurationSeconds, 780);
    const post = (value: unknown) => fetch(base + '/v1/geospatial/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal((await post({ input: '', extra: true })).status, 400);
    assert.equal((await post({ input: 'x'.repeat(config.maxBodyBytes + 1) })).status, 400);
    const localSession = await client.startPlacesSession();
    const local = (await localSession.search('UAEM Atlacomulco')).find(place => place.provenance === 'vima-local')!;
    assert.ok(local); assert.equal((await localSession.resolve(local.id)).provenance, 'vima-local');
    const close = await client.startPlacesSession(); await close.close();
    assert.equal((await fetch(base + '/health')).status, 429);
    const logged = JSON.stringify(logs);
    for (const value of [sensitive, 'Plaza Atlacomulco', String(position[0]), providerPlace.id, 'must-not-reach-client']) assert.equal(logged.includes(value), false);
    assert.ok(logs.some(entry => entry.upstreamStatus === 200 && entry.count === 1));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
