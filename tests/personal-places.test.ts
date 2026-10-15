import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersonalPlaces, RECENT_PLACE_LIMIT } from '../src/services/geospatial/personalPlaces.ts';
import { approvedLocalPlaces } from '../src/services/geospatial/localPlaces.ts';

test('previously saved Plaza references use the verified coordinate without migration, lost metadata or merging shops', async () => {
  const plaza = approvedLocalPlaces[0]!;
  const saved = [...plaza.providerRefs!, plaza.id, 'tomtom:independent-shop'].map(canonicalId => ({
    canonicalId, name: 'Plaza Atlacomulco', address: 'Dirección guardada', coordinate: [-99.92308, 19.8338],
    savedAt: 123, image: { source: 'vima', assetId: 'approved-image', version: 1 },
  }));
  const state = new Map([
    ['vima.favorite-places.v1', JSON.stringify({ version: 1, places: saved })],
    ['vima.recent-destinations.v1', JSON.stringify({ version: 1, places: saved })],
    ['vima.saved-slots.v1', JSON.stringify({ version: 1, home: saved[1], work: saved[3] })],
  ]);
  const before = [...state];
  const repository = createPersonalPlaces({ getItem: async key => state.get(key) ?? null,
    setItem: async (key, value) => { state.set(key, value); } });
  for (const places of [await repository.favorites(), await repository.recents()]) {
    assert.equal(places.length, 4);
    places.slice(0, 3).forEach((place, index) => {
      assert.deepEqual(place.coordinate, plaza.coordinate);
      assert.equal(place.canonicalId, saved[index]!.canonicalId);
      assert.equal(place.savedAt, 123); assert.deepEqual(place.image, saved[index]!.image);
    });
    assert.deepEqual(places[3]!.coordinate, saved[3]!.coordinate);
  }
  assert.deepEqual((await repository.slots()).home?.coordinate, plaza.coordinate);
  assert.deepEqual((await repository.slots()).work?.coordinate, saved[3]!.coordinate);
  assert.deepEqual([...state], before);
  await repository.removeFavorite(saved[1]!.canonicalId);
  assert.equal((await repository.favorites()).length, 3);
});

test('favorites and confirmed destinations are versioned, bounded, private and survive repository restart', async () => {
  const state = new Map<string, string>();
  const store = { getItem: async (key: string) => state.get(key) ?? null,
    setItem: async (key: string, value: string) => { state.set(key, value); } };
  const repository = createPersonalPlaces(store, () => 1234);
  const place = (id: string) => ({ id, canonicalId: `canonical:${id}`, name: `Lugar ${id}`, address: 'Atlacomulco',
    coordinate: [-99.87, 19.8] as const, provenance: 'provider' as const, regionId: 'atlacomulco' });
  await repository.saveFavorite(place('a'));
  await repository.saveFavorite(place('a'));
  assert.equal((await repository.favorites()).length, 1);
  assert.equal((await createPersonalPlaces(store).favorites())[0]?.canonicalId, 'canonical:a');
  for (let index = 0; index < RECENT_PLACE_LIMIT + 4; index++)
    await repository.recordConfirmedDestination(place(String(index)));
  assert.equal((await repository.recents()).length, RECENT_PLACE_LIMIT);
  assert.equal((await repository.recents())[0]?.canonicalId, `canonical:${RECENT_PLACE_LIMIT + 3}`);
  assert.ok(state.get('vima.recent-destinations.v1')?.includes('"version":1'));
  assert.doesNotMatch([...state.values()].join(' '), /query|raw|providerPayload|searchPerformed/);
  await repository.removeFavorite('canonical:a');
  assert.deepEqual(await repository.favorites(), []);
});

test('personal place decoder rejects corrupt versions and strips unknown fields', async () => {
  let raw = JSON.stringify({ version: 2, places: [] });
  const repository = createPersonalPlaces({ getItem: async () => raw, setItem: async (_key, value) => { raw = value; } });
  assert.deepEqual(await repository.recents(), []);
  raw = JSON.stringify({ version: 1, places: [{ canonicalId: 'a', name: 'A', address: '',
    coordinate: [-99, 19], savedAt: 1, raw: 'discard' }, { canonicalId: 'bad', name: 'B', address: '', coordinate: [181, 0], savedAt: 1 }] });
  assert.deepEqual(await repository.recents(), [{ canonicalId: 'a', name: 'A', address: '', coordinate: [-99, 19], savedAt: 1 }]);
});

test('Home and Work persist full sanitized places independently of legacy favorites and recents', async () => {
  const state = new Map<string, string>();
  const store = { getItem: async (key: string) => state.get(key) ?? null,
    setItem: async (key: string, value: string) => { state.set(key, value); } };
  const repository = createPersonalPlaces(store, () => 42);
  const first = { id: 'tomtom:one', name: 'Casa real', address: 'Calle 1', coordinate: [-99.87, 19.8] as const,
    regionId: 'atlacomulco', category: 'residential',
    image: { source: 'vima' as const, assetId: 'home-one', version: 1 } };
  await repository.saveFavorite(first);
  await repository.recordConfirmedDestination(first);
  const favoriteRaw = state.get('vima.favorite-places.v1');
  const recentRaw = state.get('vima.recent-destinations.v1');
  await repository.saveSlot('home', first);
  await repository.saveSlot('work', { ...first, id: 'tomtom:work', name: 'Trabajo real' });
  const restored = createPersonalPlaces(store);
  assert.deepEqual(await restored.slots(), {
    home: { canonicalId: 'tomtom:one', name: 'Casa real', address: 'Calle 1', coordinate: [-99.87, 19.8],
      regionId: 'atlacomulco', category: 'residential', image: first.image, savedAt: 42 },
    work: { canonicalId: 'tomtom:work', name: 'Trabajo real', address: 'Calle 1', coordinate: [-99.87, 19.8],
      regionId: 'atlacomulco', category: 'residential', image: first.image, savedAt: 42 },
  });
  await restored.saveSlot('home', { ...first, id: 'tomtom:replacement', name: 'Casa nueva' });
  assert.equal((await restored.slots()).home?.canonicalId, 'tomtom:replacement');
  await restored.removeSlot('work');
  assert.equal((await restored.slots()).work, null);
  assert.equal(state.get('vima.favorite-places.v1'), favoriteRaw);
  assert.equal(state.get('vima.recent-destinations.v1'), recentRaw);
  assert.deepEqual((await restored.recents())[0]?.image, first.image);
});

test('missing and corrupt saved slots do not affect existing collections', async () => {
  const state = new Map<string, string>([['vima.saved-slots.v1', '{invalid']]);
  const store = { getItem: async (key: string) => state.get(key) ?? null,
    setItem: async (key: string, value: string) => { state.set(key, value); } };
  const repository = createPersonalPlaces(store);
  assert.deepEqual(await repository.slots(), { home: null, work: null });
  state.set('vima.saved-slots.v1', JSON.stringify({ version: 1, home: { name: 'Solo texto' }, work: null }));
  assert.deepEqual(await repository.slots(), { home: null, work: null });
  await assert.rejects(repository.saveSlot('home', { id: 'manual', name: 'Sin dirección', address: '', coordinate: [-99, 19] }));
  assert.deepEqual(await repository.favorites(), []);
});
