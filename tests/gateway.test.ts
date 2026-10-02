import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { gatewayConfig } from '../gateway/config.ts';
import { createGateway, type GatewayLog } from '../gateway/server.ts';
import { createGatewayState } from '../gateway/state.ts';
import { createTomTomAdapter, normalizeProviderRoute, normalizeProviderSearch, providerShape, type ProviderDiagnostic } from '../gateway/tomtom.ts';
import { allowFields, query, routeRequest } from '../gateway/validation.ts';
import { createApiClient } from '../src/services/api/client.ts';
import { createGeospatialClient } from '../src/services/geospatial/client.ts';
import { localPlaces } from '../gateway/places.ts';
import { groundTruth, groundTruthMatch } from '../gateway/groundTruth.ts';

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
  assert.equal(suggestions[0]!.reference.kind, 'details');
  assert.equal(suggestions[0]!.suggestion.provenance, 'provider');
  assert.equal(suggestions[0]!.suggestion.category, undefined);
  assert.notEqual(suggestions[0]!.suggestion.id, providerPlace.id);
  assert.equal('coordinate' in suggestions[0]!.suggestion, false);
  const first = calls[0]!; const body = JSON.parse(String(first.options!.body));
  assert.deepEqual(body.preferences.geometry, { type: 'point', coordinates: position });
  assert.deepEqual(body.filters.countryCodesIso2, ['MX']); assert.equal(body.radius, undefined);
  assert.equal(new Headers(first.options!.headers).get('TomTom-Api-Version'), '3');
  assert.equal(new Headers(first.options!.headers).get('Attributes'), 'results(id,type,title,subtitles,more)');
  assert.equal(new Headers(first.options!.headers).get('Session-Id'), ctx.sessionId);
  await adapter.search('Plaza', undefined, false, ctx);
  assert.equal('preferences' in JSON.parse(String(calls[1]!.options!.body)), false);
  const place = await adapter.resolve(suggestions[0]!.reference as import('../gateway/state.ts').PlaceReference, ctx);
  assert.deepEqual(place.coordinate, position); assert.equal(place.regionId, 'atlacomulco');
  assert.equal(place.category, undefined);
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
  assert.deepEqual(normalizeProviderSearch({ results: [] }), []);
  assert.deepEqual(normalizeProviderSearch({}), []);
  assert.throws(() => normalizeProviderSearch({ results: 'invalid' }), /invalid_result/);
  assert.throws(() => normalizeProviderSearch({ unexpected: true }), /invalid_result/);
});

test('Suggest location resolves through Details in the same session without Discover, independent of local coverage', async () => {
  const calls: { url: string; session: string | null }[] = [];
  const uaem = { ...providerPlace, id: 'provider-uaem', title: 'Centro Universitario UAEM Atlacomulco',
    subtitles: ['Carretera Toluca–Atlacomulco km 60, Atlacomulco'],
    more: { operation: 'details', pathParameters: [{ parameter: 'type', argument: 'pois' },
      { parameter: 'id', argument: 'provider-uaem' }] } };
  const adapter = createTomTomAdapter('dummy-key', config, async (url, options) => {
    calls.push({ url: String(url), session: new Headers(options?.headers).get('Session-Id') });
    return Response.json(String(url).includes('/details/') ? uaem : String(url).endsWith('/suggest')
      ? { results: [uaem] } : {});
  });
  const server = createGateway(config, adapter, { localPlaces });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = createGeospatialClient(createApiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async () => null, { development: true }), 2000);
  try {
    const session = await client.startPlacesSession();
    const found = await session.autocomplete(groundTruth[2].query);
    const provider = found.find(place => place.provenance === 'provider' && groundTruthMatch(place, groundTruth[2]));
    assert.ok(provider); assert.notEqual(provider.id, uaem.id);
    const resolved = await session.resolve(provider.id);
    assert.ok(groundTruthMatch(resolved, groundTruth[2]));
    assert.deepEqual(resolved.coordinate, position);
    assert.deepEqual(calls.map(call => new URL(call.url).pathname.split('/').at(-1)), ['suggest', 'provider-uaem']);
    assert.ok(calls[0]!.session); assert.equal(calls[0]!.session, calls[1]!.session);
    const onlyLocal = createTomTomAdapter('dummy-key', config, async () => Response.json({ results: [] }));
    const localServer = createGateway(config, onlyLocal, { localPlaces });
    localServer.listen(0, '127.0.0.1'); await once(localServer, 'listening');
    try {
      const localClient = createGeospatialClient(createApiClient(`http://127.0.0.1:${(localServer.address() as AddressInfo).port}`,
        async () => null, { development: true }), 2000);
      const localSession = await localClient.startPlacesSession();
      const local = await localSession.autocomplete(groundTruth[2].query);
      assert.equal(local.some(place => place.provenance === 'provider' && groundTruthMatch(place, groundTruth[2])), false);
      await localSession.close();
    } finally { localServer.closeAllConnections(); await new Promise<void>(resolve => localServer.close(() => resolve())); }
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('Suggest discover action follows bounded Discover and Details with one Session-Id and fixed TomTom origin', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const action = { type: 'discoverAction', title: 'Universidades', more: { operation: 'discover',
    url: 'https://attacker.example/steal', requestBody: { filters: { types: ['poi'], poiTypes: ['university'] } } } };
  const place = { ...providerPlace, more: { operation: 'details', pathParameters: [
    { parameter: 'type', argument: 'pois' }, { parameter: 'id', argument: providerPlace.id }] } };
  const adapter = createTomTomAdapter('dummy-key', config, async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(String(url).endsWith('/suggest') ? { results: [action] } :
      String(url).endsWith('/discover') ? { results: [place] } : place);
  });
  const ctx = { ...context(), sessionId: randomUUID() };
  const actions = await adapter.search('universidades', undefined, true, ctx);
  assert.equal(actions[0]!.suggestion.kind, 'action');
  assert.equal(actions[0]!.reference.kind, 'discover');
  const results = await adapter.followDiscover(actions[0]!.reference as import('../gateway/state.ts').DiscoverReference, undefined, ctx);
  assert.equal(results[0]!.suggestion.name, 'Plaza Atlacomulco');
  await adapter.resolve(results[0]!.reference as import('../gateway/state.ts').PlaceReference, ctx);
  assert.deepEqual(calls.map(call => new URL(call.url).pathname.split('/').at(-1)), ['suggest', 'discover', providerPlace.id]);
  assert.ok(calls.every(call => new URL(call.url).origin === 'https://api.tomtom.com'));
  assert.ok(calls.every(call => new Headers(call.options?.headers).get('Session-Id') === ctx.sessionId));
  assert.deepEqual(JSON.parse(String(calls[1]!.options!.body)).filters,
    { countryCodesIso2: ['MX'], types: ['poi'], poiTypes: ['university'] });
  assert.throws(() => normalizeProviderSearch({ results: [{ ...place, more: { operation: 'details', pathParameters: [
    { parameter: 'type', argument: 'addresses' }, { parameter: 'id', argument: providerPlace.id }] } }] }), /invalid_result/);
});

test('HTTP follow-up keeps the session open and never resolves an action as a place', async () => {
  const calls: string[] = [];
  const adapter = createTomTomAdapter('dummy-key', config, async url => {
    calls.push(String(url));
    if (String(url).endsWith('/suggest')) return Response.json({ results: [{ type: 'discoverAction', title: 'Universidades',
      more: { operation: 'discover', requestBody: { filters: { poiTypes: ['university'] } } } }] });
    if (String(url).endsWith('/discover')) return Response.json({ results: [providerPlace] });
    return Response.json(providerPlace);
  });
  const server = createGateway(config, adapter);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = createGeospatialClient(createApiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    async () => null, { development: true }), 2000);
  try {
    const session = await client.startPlacesSession();
    const [action] = await session.autocomplete('universidades');
    assert.equal(action?.kind, 'action');
    await assert.rejects(session.resolve(action!.id), /invalid_result/);
    // A new Vima session is needed after a failed resolution attempt, as on mobile.
    const next = await client.startPlacesSession();
    const [again] = await next.autocomplete('universidades');
    const [result] = await next.followUp(again!.id);
    assert.equal(result?.name, 'Plaza Atlacomulco');
    assert.equal((await next.resolve(result!.id)).name, 'Plaza Atlacomulco');
    assert.deepEqual(calls.map(url => new URL(url).pathname.split('/').at(-1)),
      ['suggest', 'suggest', 'discover', providerPlace.id]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('provider diagnostics report only bounded structure before a malformed Details result is rejected', async () => {
  const events: ProviderDiagnostic[] = [];
  const upstream = { id: 'raw-provider-id', type: 'area', title: 'Centro Universitario UAEM Atlacomulco',
    address: { municipality: 'Atlacomulco', street: 'private-address' }, position: { type: 'Point', coordinates: position },
    more: { operation: 'details', pathParameters: [{ parameter: 'type', argument: 'areas' },
      { parameter: 'id', argument: 'raw-provider-id' }] } };
  const adapter = createTomTomAdapter('dummy-key', config, async url => Response.json(String(url).includes('details')
    ? { ...upstream, position: undefined } : { results: [upstream] }), event => events.push(event));
  const choices = await adapter.search('Centro Universitario UAEM Atlacomulco', undefined, false, context());
  assert.equal(choices[0]!.reference.kind, 'details');
  await assert.rejects(adapter.resolve(choices[0]!.reference as import('../gateway/state.ts').PlaceReference, context()), /invalid_result/);
  assert.deepEqual(events.map(event => event.operation), ['search', 'details']);
  assert.deepEqual(events[1]!.results[0], {
    kind: 'object', type: 'area', hasId: true, hasTitle: true, hasPosition: false,
    hasAddress: true, hasSubtitles: false, hasDetailsLink: true,
  });
  const diagnosticText = JSON.stringify(events);
  for (const sensitive of ['raw-provider-id', 'private-address', String(position[0]), 'dummy-key', upstream.title]) {
    assert.equal(diagnosticText.includes(sensitive), false);
  }
  assert.equal(providerShape(null).kind, 'other');
});

test('a documented area Details response with a valid Point and no address remains a resolved Vima place', async () => {
  const adapter = createTomTomAdapter('dummy-key', config, async () => Response.json({
    id: 'area-id', type: 'area', title: 'Centro Universitario Atlacomulco',
    position: { type: 'Point', coordinates: position },
  }));
  const place = await adapter.resolve({ kind: 'details', type: 'areas', id: 'area-id' }, context());
  assert.equal(place.name, 'Centro Universitario Atlacomulco');
  assert.equal(place.address, '');
  assert.deepEqual(place.coordinate, position);
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
