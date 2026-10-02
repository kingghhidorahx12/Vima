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
