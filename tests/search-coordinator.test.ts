import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchCoordinator } from '../src/services/geospatial/searchCoordinator.ts';
import { approvedLocalPlaces } from '../src/services/geospatial/localPlaces.ts';
import { geospatialClientConfig } from '../src/services/geospatial/config.ts';

test('local and personal results are immediate, while only compatible stale remote results remain', () => {
  const coordinator = createSearchCoordinator(approvedLocalPlaces);
  const favorite = { id: 'favorite', name: 'Mercado Atlacomulco', address: 'Centro, Atlacomulco' };
  assert.equal(coordinator.visible('merc', [favorite], [])[0]?.id, 'favorite');
  assert.equal(coordinator.visible('UAEM', [], [])[0]?.id, 'vima-local:cu-uaem-atlacomulco');
  const remote = [{ id: 'remote', name: 'Mercado Municipal', address: 'Atlacomulco' }];
  coordinator.remember('merc', remote);
  assert.ok(coordinator.visible('merc', [], []).some(place => place.id === 'remote'));
  assert.deepEqual(coordinator.visible('universidad', [], [], remote).filter(place => place.id === 'remote'), []);
  assert.deepEqual(coordinator.visible('   ', [favorite], [], remote), []);
  assert.equal(geospatialClientConfig.debounceMs, 200);
});

test('optional image metadata and an image loading failure never change search order', () => {
  const coordinator = createSearchCoordinator(approvedLocalPlaces);
  const places = [{ id: 'one', name: 'Mercado Atlacomulco', address: 'Centro' },
    { id: 'two', name: 'Mercado Municipal', address: 'Centro' }];
  const before = coordinator.visible('merc', places, []).map(place => place.id);
  const withImage = [{ ...places[0]!, image: { source: 'vima' as const, assetId: 'mercado', version: 1 } }, places[1]!];
  const after = coordinator.visible('merc', withImage, []).map(place => place.id);
  assert.deepEqual(after, before);
  assert.equal(coordinator.visible('merc', withImage, [])[0]?.image?.source, 'vima');
});
