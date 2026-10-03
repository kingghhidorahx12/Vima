import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { ApiError, createApiClient } from '../src/services/api/client.ts';
import { createGeospatialClient } from '../src/services/geospatial/client.ts';
import { createPlaceSearch } from '../src/services/geospatial/search.ts';
import { resolveGeoMode } from '../src/services/geospatial/config.ts';
import { rankRegionalPlaces, rankingReason, initialRegion, isGeographicQuery, regionForText } from '../src/services/geospatial/regionalRanking.ts';
import { samePlace } from '../src/services/geospatial/placeIdentity.ts';
import { providerCanonicalId } from '../gateway/tomtom.ts';
import { localPlaces } from '../gateway/places.ts';
import type { PlaceSuggestion } from '../src/services/geospatial/contracts.ts';
import { createPassengerLiveGateway } from '../src/services/geospatial/passengerGateway.ts';
import { canRequest } from '../src/features/passenger/model.ts';

test('regional buckets preserve text relevance, external exact match and stable provider order', () => {
  const place = (id: string, name: string, regionId: string): PlaceSuggestion => ({ id, name, regionId, address: regionId, provenance: 'provider' });
  const external = place('external', 'Plaza', 'toluca');
  const local = place('local', 'Plaza Atlacomulco', 'atlacomulco');
  const neighbor = place('neighbor', 'Plaza regional', 'el-oro');
  const unrelated = place('unrelated', 'Museo', 'atlacomulco');
  assert.deepEqual(rankRegionalPlaces([neighbor, unrelated, external, local], [], 'Plaza').map(p => p.id), ['external', 'local', 'neighbor', 'unrelated']);
  assert.equal(rankingReason(external, 'Plaza').reason, 'exact-name:external');
  assert.equal(rankingReason(local, 'Plaza').reason, 'title-prefixes:atlacomulco');
  assert.equal(initialRegion.length, 7);
  const equal = [place('first', 'Plaza Norte', 'jocotitlan'), place('second', 'Plaza Sur', 'acambay')];
  assert.deepEqual(rankRegionalPlaces(equal, [], 'Plaza'), equal);
});

test('Local Places aliases dedupe provider identities and do not inject irrelevant places', () => {
  const candidate = { ...localPlaces[1]!, id: 'provider-campus', name: 'Centro Universitario Atlacomulco', provenance: 'provider' as const };
  assert.equal(rankRegionalPlaces([candidate, candidate], localPlaces, 'UAEM Atlacomulco').length, 1);
  assert.equal(rankRegionalPlaces([], localPlaces, 'inexistente').length, 0);
  assert.equal(rankRegionalPlaces([], localPlaces, 'UAEM Atlacomulco')[0]!.provenance, 'vima-local');
  assert.equal(rankingReason(localPlaces[1]!, 'UAEM Atlacomulco', localPlaces[1]!.aliases).reason, 'exact-name:explicit-region');
});

test('canonical identity preserves neighboring branches and requires explicit evidence for an alias', () => {
  const branch = { id: 'branch-a', name: 'Coppel', address: 'Atlacomulco', coordinate: [-99.87, 19.80] as const,
    provenance: 'provider' as const, regionId: 'atlacomulco' };
  const nearbyBranch = { ...branch, id: 'branch-b', coordinate: [-99.8704, 19.8004] as const };
  assert.equal(samePlace(branch, nearbyBranch), false);
  assert.equal(rankRegionalPlaces([branch, nearbyBranch], [], 'Coppel').length, 2);
  const local = { ...branch, id: 'vima-local:coppel-a', canonicalName: 'Coppel A', name: 'Coppel A', aliases: ['Coppel'],
    status: 'verified' as const, provenance: 'vima-local' as const };
  assert.equal(samePlace(branch, local), true);
  assert.equal(samePlace({ ...branch, coordinate: [-99.9, 19.8] }, local), false);
  assert.equal(samePlace({ ...branch, providerRef: 'known' }, { ...local, providerRefs: ['known'] }), true);
  assert.equal(rankRegionalPlaces([branch], [local], 'Coppel')[0]!.id, local.id);
  assert.deepEqual(rankRegionalPlaces([], [{ ...local, status: 'pending' }], 'Coppel'), []);
  assert.equal(providerCanonicalId('pois', 'abc'), providerCanonicalId('pois', 'abc'));
  assert.notEqual(providerCanonicalId('pois', 'abc'), providerCanonicalId('pois', 'def'));
  assert.doesNotMatch(providerCanonicalId('pois', 'abc'), /abc/);
});

test('explicit municipalities and area results beat generic Centro matches without rewarding Afore Coppel', () => {
  assert.equal(regionForText('Atlacomulco de Fabela'), 'atlacomulco');
  assert.equal(regionForText('Ixtlahuaca de Rayón'), 'ixtlahuaca');
  assert.equal(regionForText('El Oro de Hidalgo'), 'el-oro');
  assert.equal(isGeographicQuery('Centro Ixtlahuaca'), true);
  assert.equal(isGeographicQuery('Coppel Atlacomulco'), false);
  const area = { id: 'area', name: 'Ixtlahuaca de Rayón', address: 'Estado de México',
    category: 'area', regionId: 'ixtlahuaca' };
  const business = { id: 'business', name: 'Centro Comercial', address: 'Ixtlahuaca', category: 'poi', regionId: 'ixtlahuaca' };
  assert.equal(rankRegionalPlaces([business, area], [], 'Centro Ixtlahuaca')[0]?.id, 'area');
  const coppel = { id: 'shop', name: 'Coppel', address: 'Nicolás Bravo, Atlacomulco', regionId: 'atlacomulco' };
  const afore = { id: 'afore', name: 'Afore Coppel', address: 'Nicolás Bravo, Atlacomulco', regionId: 'atlacomulco' };
  assert.equal(rankRegionalPlaces([afore, coppel], [], 'Coppel Nicolás Bravo Atlacomulco')[0]?.id, 'shop');
});

test('search cancels/ignores old responses, shares session, forwards bias and closes on flow change', async () => {
  let resolveOld!: (value: unknown) => void; let markOld!: () => void;
  const oldStarted = new Promise<void>(resolve => { markOld = resolve; });
  const paths: string[] = []; const bodies: unknown[] = [];
  const client = createGeospatialClient({ async request(input) {
    paths.push(input.path); bodies.push(input.body);
    if (input.path.endsWith('/sessions')) return input.decode({ sessionId: 'test-session' });
    if (input.path.endsWith('/autocomplete')) {
      if ((input.body as { input: string }).input === 'old') {
        markOld(); return input.decode(await new Promise(resolve => { resolveOld = resolve; }));
      }
      return input.decode({ suggestions: [{ id: 'new', name: 'New', address: '' }] });
    }
    return input.decode({});
  } }, 500);
  const search = createPlaceSearch(client, 0);
  const old = search.suggest('old').catch(error => error);
  await oldStarted;
  const recent = await search.suggest('new', undefined, [-99, 19]);
  resolveOld({ suggestions: [{ id: 'old', name: 'Old', address: '' }] });
  assert.equal((await old).code, 'cancelled'); assert.equal(recent[0]!.id, 'new');
  assert.equal(paths.filter(path => path.endsWith('/sessions')).length, 1);
  assert.deepEqual(bodies[2], { input: 'new', bias: [-99, 19] });
  search.close(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(paths.includes('/v1/geospatial/places/sessions/test-session'));
});

test('Suggest works without AbortSignal.throwIfAborted and still cancels stale work', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'throwIfAborted');
  assert.ok(descriptor);
  Reflect.deleteProperty(AbortSignal.prototype, 'throwIfAborted');
  try {
    assert.equal('throwIfAborted' in new AbortController().signal, false);
    let resolveOld!: (value: unknown) => void; let oldStarted!: () => void;
    const started = new Promise<void>(resolve => { oldStarted = resolve; });
    const client = createGeospatialClient({ async request(input) {
      if (input.path.endsWith('/sessions')) return input.decode({ sessionId: 'hermes-session' });
      if (input.path.endsWith('/autocomplete') && (input.body as { input: string }).input === 'old') {
        oldStarted(); return input.decode(await new Promise(resolve => { resolveOld = resolve; }));
      }
      return input.decode({ suggestions: [{ id: 'new', name: 'New', address: '' }] });
    } }, 500);
    const search = createPlaceSearch(client, 0);
    const old = search.suggest('old').catch(error => error);
    await started;
    assert.equal((await search.suggest('new'))[0]?.id, 'new');
    resolveOld({ suggestions: [{ id: 'old', name: 'Old', address: '' }] });
    assert.equal((await old).code, 'cancelled');
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(search.suggest('cancelled', aborted.signal), { code: 'cancelled' });
    search.close();
  } finally { Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', descriptor); }
});

test('DEV fixture opt-in, private HTTP restriction and no credentials over LAN HTTP', async () => {
  assert.equal(resolveGeoMode(false, '1', undefined), 'unconfigured');
  assert.equal(resolveGeoMode(true, undefined, 'https://vima.example'), 'live');
  assert.equal(resolveGeoMode(true, '1', undefined), 'fixture');
  for (const base of ['http://10.example.org', 'http://8.8.8.8', 'http://192.168.example.org']) {
    assert.throws(() => createApiClient(base, async () => null, { development: true }));
  }
  assert.throws(() => createApiClient('http://192.168.1.2', async () => null));
  assert.throws(() => createApiClient('https://username:password@vima.example', async () => null));
  const api = createApiClient('http://192.168.1.2', async () => 'test-credential', { development: true });
  await assert.rejects(api.request({ path: '/health', method: 'GET', decode: value => value }), /Credentials require HTTPS/);
});

test('expired search session is closed and the next explicit query creates a new session', async () => {
  let sessions = 0; let expires = true;
  const client = createGeospatialClient({ async request(input) {
    if (input.path.endsWith('/sessions')) return input.decode({ sessionId: `session-${++sessions}` });
    if (input.method === 'DELETE') return input.decode({});
    if (expires) { expires = false; throw new ApiError(404, 'no_result'); }
    return input.decode({ suggestions: [] });
  } }, 500);
  const search = createPlaceSearch(client, 0);
  await assert.rejects(search.suggest('expired'), /no_result/);
  assert.deepEqual(await search.suggest('retry'), []);
  assert.equal(sessions, 2); search.close();
});

test('live Passenger gateway uses normalized route, no price/matching fabrication or fixture fallback', async () => {
  let fail = false; const paths: string[] = [];
  const client = createGeospatialClient({ async request(input) {
    paths.push(input.path); if (fail) throw new TypeError('network');
    return input.decode({ status: 'unpriced', reason: 'pricing_not_configured', routePreview: { id: 'preview', createdAt: 1, expiresAt: 300001, origin, destination, stops: [], route: { geometry: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-99, 19], [-98, 20]] } },
      bounds: { southwest: [-99, 19], northeast: [-98, 20] }, distanceMeters: 1200, durationSeconds: 120, trafficDurationSeconds: 180 } } });
  } }, 500);
  const gateway = createPassengerLiveGateway(client, async () => null);
  const origin = { id: 'origin', name: 'Origin', address: '', coordinate: [-99, 19] as const };
  const destination = { ...origin, id: 'destination', coordinate: [-98, 20] as const };
  const quote = await gateway.quote({ origin, destination, stops: [] }, undefined, 'synthetic-operation-1');
  assert.deepEqual(paths, ['/v1/passenger/quotes']); assert.equal(quote.durationMinutes, 3);
  assert.equal(quote.price, undefined); assert.equal(canRequest(quote, 'online', false), false);
  assert.deepEqual(await gateway.recentPlaces(), []);
  await assert.rejects(gateway.request(quote, 'request'));
  fail = true; await assert.rejects(gateway.quote({ origin, destination, stops: [] }, undefined, 'synthetic-operation-1'), /network_recoverable/);
  assert.equal(gateway.source, 'server');
});

test('mobile source boundary excludes server provider credential, URLs and imports', () => {
  const files = fs.readdirSync('src', { recursive: true, encoding: 'utf8' }).filter(file => /\.tsx?$/.test(file));
  for (const path of files) {
    const text = fs.readFileSync(`src/${path}`, 'utf8');
    assert.doesNotMatch(text, /\bTOMTOM_API_KEY\b|api\.tomtom\.com\/maps\/orbis\/(places|routing)|from ['"][^'"]*gateway\/tomtom/);
  }
  const display = fs.readFileSync('src/map/traffic.ts', 'utf8');
  assert.match(display, /api\.tomtom\.com\/maps\/orbis\/traffic\//);
  assert.doesNotMatch(display, /key=\$|TOMTOM_API_KEY/);
  const route = fs.readFileSync('app/dev/passenger.tsx', 'utf8');
  assert.match(route, /__DEV__ && process\.env\.EXPO_PUBLIC_VIMA_FIXTURES === '1'/);
});
