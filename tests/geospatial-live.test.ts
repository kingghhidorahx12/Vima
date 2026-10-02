import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { ApiError, createApiClient } from '../src/services/api/client.ts';
import { createGeospatialClient } from '../src/services/geospatial/client.ts';
import { createPlaceSearch } from '../src/services/geospatial/search.ts';
import { resolveGeoMode } from '../src/services/geospatial/config.ts';
import { rankRegionalPlaces, rankingReason, initialRegion } from '../src/services/geospatial/regionalRanking.ts';
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
  assert.equal(rankingReason(localPlaces[1]!, 'UAEM Atlacomulco', localPlaces[1]!.aliases).reason, 'exact-name:explicit-local');
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
    return input.decode({ geometry: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-99, 19], [-98, 20]] } },
      bounds: { southwest: [-99, 19], northeast: [-98, 20] }, distanceMeters: 1200, durationSeconds: 120, trafficDurationSeconds: 180 });
  } }, 500);
  const gateway = createPassengerLiveGateway(client, async () => null);
  const origin = { id: 'origin', name: 'Origin', address: '', coordinate: [-99, 19] as const };
  const destination = { ...origin, id: 'destination', coordinate: [-98, 20] as const };
  const quote = await gateway.quote({ origin, destination, stops: [] });
  assert.deepEqual(paths, ['/v1/geospatial/routes']); assert.equal(quote.durationMinutes, 3);
  assert.equal(quote.price, undefined); assert.equal(canRequest(quote, 'online', false), false);
  assert.deepEqual(await gateway.recentPlaces(), []);
  await assert.rejects(gateway.request(quote, 'request'));
  fail = true; await assert.rejects(gateway.quote({ origin, destination, stops: [] }), /network_recoverable/);
  assert.equal(gateway.source, 'server');
});

test('mobile source boundary excludes server provider credential, URLs and imports', () => {
  const files = fs.readdirSync('src', { recursive: true, encoding: 'utf8' }).filter(file => /\.tsx?$/.test(file));
  for (const path of files) {
    const text = fs.readFileSync(`src/${path}`, 'utf8');
    assert.doesNotMatch(text, /TOMTOM_API_KEY|api\.tomtom\.com|from ['"][^'"]*gateway\/tomtom/);
  }
  const route = fs.readFileSync('app/dev/passenger.tsx', 'utf8');
  assert.match(route, /__DEV__ && process\.env\.EXPO_PUBLIC_VIMA_FIXTURES === '1'/);
});
