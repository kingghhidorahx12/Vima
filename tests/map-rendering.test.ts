import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import type { ReactTestRenderer } from 'react-test-renderer';

const require = createRequire(import.meta.url);
// Native doubles verify the MapLibre boundary, not physical Fabric/tile rendering.
const { createMapHarness } = require('./support/map-renderer.cjs');
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('MapLibre owns one persistent map, camera fit, Vima pins and route layers', async () => {
  const h = createMapHarness({ reduced: true });
  const { VimaMap } = h.load('src/map/VimaMap.tsx');
  const { Camera } = h.load('src/map/Camera.tsx');
  const { RouteLayer } = h.load('src/map/RouteLayer.tsx');
  const { PassengerMapPin, PassengerUserLocation } = h.load('src/features/passenger/PassengerMapPin.tsx');
  const place = { id: 'p', name: 'Place', address: '', coordinate: [-99, 19] };
  const route = { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString',
    coordinates: [[[-99, 19], [-98, 20]], [[-97, 21], [-96, 22]]] } };
  const target = { coordinates: [[-99, 19], [-96, 22]], padding: { bottom: 320, top: 20 } };
  const scene = () => React.createElement(VimaMap, null,
    React.createElement(Camera, { target, motion: { duration: 300, easing: 'ease' } }),
    React.createElement(PassengerMapPin, { place, kind: 'origin' }),
    React.createElement(PassengerMapPin, { place: { ...place, id: 'd' }, kind: 'destination' }),
    React.createElement(PassengerUserLocation, { place }),
    React.createElement(RouteLayer, { id: 'r', data: route, activeTone: 'greenDark', state: 'active',
      appearance: { width: 4, opacity: 1, cap: 'round', join: 'round' }, reveal: false }));
  const tree: ReactTestRenderer = await h.render(scene());
  const nativeMap = tree.root.findByType('MapLibreMap' as never).instance;
  assert.equal(tree.root.findByType('MapLibreMap' as never).props.mapStyle,
    'https://tiles.openfreemap.org/styles/positron');
  assert.deepEqual(h.calls.find((call: unknown[]) => call[0] === 'setStop')?.[1],
    { bounds: [-99, 19, -96, 22], padding: { bottom: 320, top: 20 }, zoom: undefined,
      pitch: undefined, bearing: undefined, duration: 0 });
  const pins = tree.root.findAllByType('MapLibreMarker' as never);
  assert.equal(pins.length, 3);
  assert.equal(pins[0]!.props.anchor, 'bottom');
  assert.deepEqual(pins[0]!.props.lngLat, [-99, 19]);
  assert.equal(pins[0]!.findAllByType('View' as never)[1]!.props.style[1].backgroundColor, '#00D68F');
  assert.equal(pins[1]!.findAllByType('View' as never)[1]!.props.style[1].backgroundColor, '#FF3830');
  const line = tree.root.findByType('MapLibreLayer' as never).props;
  assert.equal(line.type, 'line');
  assert.equal(line.paint['line-width'], 4);
  const routeSource = tree.root.findByType('MapLibreSource' as never).props;
  assert.equal(routeSource.id, 'r-source');
  assert.equal(JSON.parse(routeSource.data).geometry.type, 'MultiLineString');
  await h.act(async () => tree.update(scene()));
  assert.equal(tree.root.findByType('MapLibreMap' as never).instance, nativeMap);
  assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'mount' && c[1] === 'MapLibreMap').length, 1);
  await h.act(async () => tree.unmount());
});

test('approved camera motion reaches MapLibre while Reduced Motion stays immediate', async () => {
  const h = createMapHarness();
  const { VimaMap } = h.load('src/map/VimaMap.tsx');
  const { Camera } = h.load('src/map/Camera.tsx');
  const tree: ReactTestRenderer = await h.render(React.createElement(VimaMap, null,
    React.createElement(Camera, { target: { center: [-99, 19], zoom: 14 },
      motion: { duration: 300, easing: 'ease' } })));
  assert.deepEqual(h.calls.find((call: unknown[]) => call[0] === 'setStop')?.[1],
    { center: [-99, 19], padding: undefined, zoom: 14, pitch: undefined, bearing: undefined,
      duration: 300, easing: 'ease' });
  await h.act(async () => tree.unmount());
});

test('MapLibre vehicle pose flows through animated GeoJSON without React pose renders', async () => {
  const h = createMapHarness();
  const { VimaMap } = h.load('src/map/VimaMap.tsx');
  const { VehicleLayer } = h.load('src/map/VehicleLayer.tsx');
  h.poses.set({ coordinate: [-99, 19], heading: 350 });
  let renders = 0;
  const tree: ReactTestRenderer = await h.render(React.createElement(VimaMap, null,
    React.createElement(React.Profiler, { id: 'vehicle', onRender: () => { renders++; } },
      React.createElement(VehicleLayer, { id: 'vehicle', kind: 'circle', sample: h.sample,
        appearance: { radius: 12, color: '#0B0F0E', strokeWidth: 1, strokeColor: '#FFFFFF' } }))));
  const source = tree.root.findByType('MapLibreSource' as never);
  assert.deepEqual(JSON.parse(source.props.data).geometry.coordinates, [-99, 19]);
  assert.equal(tree.root.findByType('MapLibreLayer' as never).props.paint['circle-radius'], 12);
  const afterMount = renders;
  h.poses.set({ coordinate: [-98, 20], heading: 10 });
  await h.flush();
  assert.equal(renders, afterMount);
  await h.act(async () => tree.unmount());
});
