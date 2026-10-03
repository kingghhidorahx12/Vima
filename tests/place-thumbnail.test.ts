import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import renderer from 'react-test-renderer';
import { createPlaceMediaResolver } from '../src/services/geospatial/placeMedia.ts';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

test('thumbnail keeps its footprint and Vima icon when media is absent or fails', async () => {
  const h = createHarness();
  const { PlaceThumbnail } = h.load('src/features/passenger/PlaceThumbnail.tsx');
  const resolveMedia = createPlaceMediaResolver('https://vima.example');
  const place = { id: 'local', canonicalId: 'vima-local:plaza-atlacomulco', name: 'Plaza Atlacomulco',
    address: 'Atlacomulco', category: 'mall', coordinate: [-99, 19],
    image: { source: 'vima', assetId: 'plaza-atlacomulco', version: 1 } };
  let tree!: renderer.ReactTestRenderer;
  await renderer.act(async () => { tree = renderer.create(React.createElement(PlaceThumbnail, { place, resolveMedia })); });
  try {
    const container = tree.root.findAllByType('View' as never)[0]!;
    assert.equal(container.props.style.width, 48);
    assert.equal(container.props.style.height, 48);
    assert.equal(tree.root.findAllByType('ExpoImage' as never).length, 1);
    const photo = tree.root.findByType('ExpoImage' as never);
    assert.equal(photo.props.cachePolicy, 'memory-disk');
    assert.equal(photo.props.recyclingKey, place.canonicalId);
    assert.equal(photo.props.transition, 180);
    assert.equal(photo.props.source.cacheKey, 'place-image:plaza-atlacomulco:v1:thumb');
    await renderer.act(async () => photo.props.onError());
    assert.equal(tree.root.findAllByType('ExpoImage' as never).length, 0);
    assert.ok(tree.root.findAllByType('View' as never).length > 1);
    await renderer.act(async () => tree.update(React.createElement(PlaceThumbnail, {
      place: { ...place, image: undefined }, resolveMedia })));
    assert.equal(tree.root.findAllByType('ExpoImage' as never).length, 0);
    assert.equal(tree.root.findAllByType('View' as never)[0]!.props.style.width, 48);
  } finally { await renderer.act(async () => tree.unmount()); }
});
