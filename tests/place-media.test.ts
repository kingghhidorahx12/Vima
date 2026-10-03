import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { gatewayConfig } from '../gateway/config.ts';
import { loadPlaceMediaCatalog } from '../gateway/placeMedia.ts';
import { localPlaces } from '../gateway/places.ts';
import { createGateway } from '../gateway/server.ts';
import { createTomTomAdapter } from '../gateway/tomtom.ts';
import { createPersonalPlaces } from '../src/services/geospatial/personalPlaces.ts';
import { createPlaceMediaResolver, parsePlaceImageRef } from '../src/services/geospatial/placeMedia.ts';
import { decodeSuggestion } from '../src/services/geospatial/normalize.ts';

const assetId = 'plaza-atlacomulco-thumb';
const canonicalPlaceId = localPlaces[0]!.id;
const entry = { assetId, canonicalPlaceId, owner: 'Vima', source: 'cesión documentada',
  license: 'permiso documentado', addedAt: '2026-10-02T00:00:00.000Z', version: 1 };
const tinyWebp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');

async function withCatalog(fn: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'vima-media-test-'));
  assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`));
  try { await fn(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
async function manifest(directory: string, images: unknown[]) {
  await writeFile(join(directory, 'manifest.v1.json'), JSON.stringify({ version: 1, images }));
}
async function image(directory: string, id = assetId, bytes = tinyWebp) {
  await mkdir(join(directory, id)); await writeFile(join(directory, id, 'thumb.webp'), bytes);
}

test('stable Vima and external refs never use a URL as place identity; cache key versions independently', () => {
  const vima = parsePlaceImageRef({ source: 'vima', assetId, version: 1 });
  const external = parsePlaceImageRef({ source: 'external', provider: 'future-provider', externalRef: 'opaque-123',
    expiresAt: '2027-01-01T00:00:00Z' });
  assert.deepEqual(vima, { source: 'vima', assetId, version: 1 });
  assert.equal(external?.source, 'external');
  assert.equal(parsePlaceImageRef({ source: 'external', provider: 'future-provider', externalRef: 'https://photos.invalid/1' }), undefined);
  assert.equal(parsePlaceImageRef({ source: 'external', provider: 'future-provider', externalRef: 'file:///tmp/photo' }), undefined);
  assert.equal(parsePlaceImageRef({ source: 'vima', assetId: '../secret', version: 1 }), undefined);
  const resolver = createPlaceMediaResolver('https://vima.example');
  const first = resolver(canonicalPlaceId, vima!);
  assert.equal(first?.cacheKey, `place-image:${assetId}:v1:thumb`);
  assert.equal(first?.uri, `https://vima.example/v1/media/place-images/${assetId}/thumbnail?v=1`);
  assert.notEqual(resolver(canonicalPlaceId, { source: 'vima', assetId, version: 2 })?.cacheKey, first?.cacheKey);
  assert.equal(resolver(canonicalPlaceId, external!), undefined);
});

test('bad optional image metadata is omitted without turning a valid search result into an error', () => {
  const place = decodeSuggestion({ id: canonicalPlaceId, name: 'Plaza Atlacomulco', address: 'Atlacomulco',
    image: { source: 'vima', assetId: '../../bad', version: 1 } });
  assert.equal(place.id, canonicalPlaceId);
  assert.equal(place.image, undefined);
});

test('favorites and recents preserve only stable refs and canonical identity', async () => {
  const storage = new Map<string, string>();
  const personal = createPersonalPlaces({ getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); } });
  const place = { ...localPlaces[0]!, canonicalId: canonicalPlaceId,
    image: { source: 'vima' as const, assetId, version: 1 } };
  await personal.saveFavorite(place); await personal.recordConfirmedDestination(place);
  assert.equal((await personal.favorites())[0]?.canonicalId, canonicalPlaceId);
  assert.deepEqual((await personal.favorites())[0]?.image, place.image);
  assert.deepEqual((await personal.recents())[0]?.image, place.image);
  assert.ok(![...storage.values()].some(value => value.includes('https://')));
});

test('catalog publishes only verified places with valid owned files and serves versioned WebP', async () => {
  await withCatalog(async directory => {
    await manifest(directory, [entry]); await image(directory);
    const media = await loadPlaceMediaCatalog(directory, localPlaces);
    assert.equal(media.count, 1);
    assert.deepEqual(media.imageFor(canonicalPlaceId), { source: 'vima', assetId, version: 1 });
    assert.equal(media.imageFor('pending'), undefined);
    assert.deepEqual(await media.thumbnail(assetId, 1), tinyWebp);
    assert.equal(await media.thumbnail(assetId, 2), undefined);
    const config = gatewayConfig({});
    const adapter = createTomTomAdapter('test-only', config, async () => Response.json({ results: [] }));
    const server = createGateway(config, adapter, { localPlaces, media });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const response = await fetch(`${base}/v1/media/place-images/${assetId}/thumbnail?v=1`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      assert.match(response.headers.get('cache-control') ?? '', /immutable/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), tinyWebp);
      assert.equal((await fetch(`${base}/v1/media/place-images/${assetId}/thumbnail?v=2`)).status, 404);
      assert.notEqual((await fetch(`${base}/v1/media/place-images/..%2Fsecret/thumbnail`)).status, 200);
      const session = await fetch(`${base}/v1/geospatial/places/sessions`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(result => result.json()) as { sessionId: string };
      const suggestions = await fetch(`${base}/v1/geospatial/places/sessions/${session.sessionId}/autocomplete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'Plaza Atlacomulco' }),
      }).then(result => result.json()) as { suggestions: { id: string; image?: unknown }[] };
      assert.deepEqual(suggestions.suggestions.find(place => place.id === canonicalPlaceId)?.image,
        { source: 'vima', assetId, version: 1 });
    } finally { server.close(); await once(server, 'close'); }
  });
});

test('missing, corrupt, pending and traversal media fail closed without a public image', async () => {
  await withCatalog(async directory => {
    await manifest(directory, [entry]);
    assert.equal((await loadPlaceMediaCatalog(directory, localPlaces)).count, 0);
    await image(directory, assetId, Buffer.from('not webp'));
    assert.equal((await loadPlaceMediaCatalog(directory, localPlaces)).count, 0);
    await writeFile(join(directory, assetId, 'thumb.webp'), tinyWebp);
    await manifest(directory, [{ ...entry, assetId: '../outside' }]);
    assert.equal((await loadPlaceMediaCatalog(directory, localPlaces)).count, 0);
    await manifest(directory, [{ ...entry, canonicalPlaceId: 'pending' }]);
    assert.equal((await loadPlaceMediaCatalog(directory,
      [...localPlaces, { ...localPlaces[0]!, id: 'pending', status: 'pending' }])).count, 0);
  });
});
