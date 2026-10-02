import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import type { ReactTestRenderer } from 'react-test-renderer';

const require = createRequire(import.meta.url);
// Native SDK doubles validate props and commands, not physical Fabric/Google rendering.
const { createMapHarness } = require('./support/map-renderer.cjs');
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('Google map, camera, route and approved pins keep the persistent map instance and sheet padding', async () => {
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
  const nativeMap = tree.root.findByType('GoogleMap' as never).instance;
  const mapProps = tree.root.findByType('GoogleMap' as never).props;
  assert.equal(mapProps.provider, 'google');
  assert.equal(mapProps.googleMapId, process.env.EXPO_PUBLIC_GOOGLE_MAP_ID?.trim() || undefined);
  assert.equal(mapProps.showsUserLocation, false); // expo-location owns the dot.
  await h.act(async () => mapProps.onMapReady());
  await h.flush();
  assert.equal(tree.root.findByType('GoogleMap' as never).props.mapPadding.bottom, 320);
  const fit = h.calls.find((call: unknown[]) => call[0] === 'fitToCoordinates');
  assert.ok(fit);
  assert.equal(fit[2].animated, false);
  const pins = tree.root.findAllByType('GoogleMarker' as never);
  assert.equal(pins.length, 3);
  assert.deepEqual(pins[0]!.props.anchor, { x: 0.5, y: 1 });
  const originViews = pins[0]!.findAllByType('View' as never);
  assert.equal(originViews[1]!.props.style[1].backgroundColor, '#00D68F');
  const destinationViews = pins[1]!.findAllByType('View' as never);
  assert.equal(destinationViews[1]!.props.style[1].backgroundColor, '#FF3830');
  const lines = tree.root.findAllByType('GooglePolyline' as never);
  assert.equal(lines.length, 2);
  assert.equal(lines[0]!.props.strokeWidth, 4);
  assert.deepEqual(lines[1]!.props.coordinates, [{ longitude: -97, latitude: 21 }, { longitude: -96, latitude: 22 }]);
  await h.act(async () => tree.update(scene()));
  assert.equal(tree.root.findByType('GoogleMap' as never).instance, nativeMap);
  assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'mount' && c[1] === 'GoogleMap').length, 1);
  assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'unmount' && c[1] === 'GoogleMap').length, 0);
  await h.act(async () => tree.unmount());
});

test('Google vehicle receives native coordinate/heading updates with no React render per pose', async () => {
  const h = createMapHarness();
  const { VimaMap } = h.load('src/map/VimaMap.tsx');
  const { VehicleLayer } = h.load('src/map/VehicleLayer.tsx');
  let renders = 0;
  const tree: ReactTestRenderer = await h.render(React.createElement(VimaMap, null,
    React.createElement(React.Profiler, { id: 'vehicle', onRender: () => { renders++; } },
      React.createElement(VehicleLayer, { id: 'vehicle', kind: 'circle', sample: h.sample,
        appearance: { radius: 12, color: '#0B0F0E', strokeWidth: 1, strokeColor: '#FFFFFF' } }))));
  h.poses.set({ coordinate: [-99, 19], heading: 350 }); await h.flush();
  assert.equal(tree.root.findAllByType('GoogleMarker' as never).length, 1);
  const afterMount = renders;
  h.poses.set({ coordinate: [-98, 20], heading: 10 }); await h.flush();
  assert.equal(renders, afterMount);
  assert.ok(h.calls.some((c: unknown[]) => c[0] === 'setCoordinates'));
  assert.deepEqual(h.calls.at(-1), ['setNativeProps', { rotation: 10 }]);
  h.poses.set(null); await h.flush();
  assert.equal(tree.root.findAllByType('GoogleMarker' as never).length, 0);
  await h.act(async () => tree.unmount());
});
