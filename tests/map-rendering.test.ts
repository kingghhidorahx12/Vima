import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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

test('map viewport clips native markers and Search locks camera while hiding only prior presentation', async () => {
  const h = createMapHarness({ reduced: true });
  const { VimaMap } = h.load('src/map/VimaMap.tsx');
  const { MapViewportClip } = h.load('src/map/MapViewportClip.tsx');
  const { PassengerMap } = h.load('src/features/passenger/PassengerMap.tsx');
  const origin = { id: 'origin', name: 'Origen', address: '', coordinate: [-99, 19] };
  const destination = { id: 'destination', name: 'Destino', address: '', coordinate: [-98, 20] };
  const route = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-99, 19], [-98, 20]] } };
  const quote = { origin, destination, route };
  const config = { viewport: () => ({ center: [-99, 19], zoom: 14 }), route: { width: 4, opacity: 1 },
    vehicle: { radius: 12, color: '#000' } };
  const scene = (locked: boolean, sheetHeight: number, mode = 'automatic') => React.createElement(MapViewportClip, null,
    React.createElement(VimaMap, null, React.createElement(PassengerMap,
      { quote, origin, destination, currentLocation: origin, home: false, ready: true,
        searchPresentationActive: locked, cameraMode: mode, sheetHeight, config })));
  const tree: ReactTestRenderer = await h.render(scene(true, 300));
  const map = tree.root.findByType('MapLibreMap' as never).instance;
  assert.equal(h.calls.filter((call: unknown[]) => call[0] === 'setStop').length, 0);
  assert.equal(tree.root.findAllByType('MapLibreMarker' as never).length, 1);
  assert.equal(tree.root.findAllByType('MapLibreSource' as never).length, 0);
  assert.ok(tree.root.findAllByType('View' as never).some((view) => view.props.style?.overflow === 'hidden'));
  assert.match(readFileSync('src/features/trip/RideShell.tsx', 'utf8'), /<MapViewportClip><VimaMap/);
  await h.act(async () => tree.update(scene(true, 420)));
  assert.equal(h.calls.filter((call: unknown[]) => call[0] === 'setStop').length, 0);
  await h.act(async () => tree.update(scene(false, 420)));
  assert.equal(tree.root.findByType('MapLibreMap' as never).instance, map);
  assert.equal(tree.root.findAllByType('MapLibreMarker' as never).length, 2);
  assert.equal(tree.root.findAllByType('MapLibreSource' as never).length, 2);
  const fits = h.calls.filter((call: unknown[]) => call[0] === 'setStop').length;
  await h.act(async () => tree.update(scene(false, 500, 'user-controlled')));
  assert.equal(h.calls.filter((call: unknown[]) => call[0] === 'setStop').length, fits);
  await h.act(async () => tree.unmount());
});

test('explicit Recenter works during Search lock without automatic refit', async () => {
  const h = createMapHarness({ reduced: true });
  const { Camera } = h.load('src/map/Camera.tsx');
  const scene = (sequence?: number, bottom = 300) => React.createElement(Camera, {
    mode: 'search-locked', target: { center: [-99, 19], padding: { bottom } },
    recenter: sequence ? { coordinate: [-99.5, 19.5], sequence } : undefined,
  });
  const tree: ReactTestRenderer = await h.render(scene());
  assert.equal(h.calls.filter((call: unknown[]) => call[0] === 'setStop').length, 0);
  await h.act(async () => tree.update(scene(undefined, 450)));
  assert.equal(h.calls.filter((call: unknown[]) => call[0] === 'setStop').length, 0);
  await h.act(async () => tree.update(scene(1, 450)));
  assert.deepEqual(h.calls.filter((call: unknown[]) => call[0] === 'setStop').at(-1)?.[1],
    { center: [-99.5, 19.5], padding: { bottom: 450 }, duration: 0 });
  await h.act(async () => tree.unmount());
});

test('Orbis layers remain absent without display key and use vector sources when enabled', async () => {
  const h = createMapHarness({ reduced: true });
  const { PassengerMap } = h.load('src/features/passenger/PassengerMap.tsx');
  const place = { id: 'p', name: 'P', address: '', coordinate: [-99, 19] };
  const config = { viewport: () => ({ center: [-99, 19] }), route: { width: 4, opacity: 1 },
    vehicle: { radius: 12, color: '#000' } };
  const scene = (available: boolean) => React.createElement(PassengerMap, { origin: place,
    destination: null, home: true, ready: true, sheetHeight: 300, config,
    displayKeyAvailable: available, layers: { traffic: true, incidents: true } });
  const tree: ReactTestRenderer = await h.render(scene(false));
  assert.equal(tree.root.findAllByType('MapLibreVectorSource' as never).length, 0);
  await h.act(async () => tree.update(scene(true)));
  const sources = tree.root.findAllByType('MapLibreVectorSource' as never);
  assert.equal(sources.length, 2);
  assert.ok(sources.every((source) => source.props.tiles[0].includes('apiVersion=2')));
  assert.deepEqual(tree.root.findAllByType('MapLibreLayer' as never).map((layer) => layer.props['source-layer']).filter(Boolean),
    ['Traffic flow', 'Traffic incident flow', 'Traffic incident points']);
  await h.act(async () => tree.unmount());
});

test('launch surface uses approved image and exits when map is ready', async () => {
  const h = createMapHarness({ reduced: true });
  const { VimaLaunchSurface } = h.load('src/motion/VimaLaunchSurface.tsx');
  const tree: ReactTestRenderer = await h.render(React.createElement(VimaLaunchSurface, { ready: false }));
  assert.equal(tree.root.findAllByType('Image' as never).length, 1);
  assert.equal(tree.root.findByType('Image' as never).props.accessibilityLabel, 'Vima');
  await h.act(async () => tree.update(React.createElement(VimaLaunchSurface, { ready: true })));
  assert.equal(tree.root.findAllByType('View' as never)[0]!.props.pointerEvents, 'none');
  await h.act(async () => tree.unmount());
});

test('incident point taps normalize documented fields and stop map dismissal bubbling', async () => {
  const h = createMapHarness();
  const { IncidentLayer } = h.load('src/map/IncidentLayer.tsx');
  const selected: unknown[] = []; let stopped = false;
  const tree: ReactTestRenderer = await h.render(React.createElement(IncidentLayer, { onSelect: (value: unknown) => selected.push(value) }));
  const source = tree.root.findByType('MapLibreVectorSource' as never);
  source.props.onPress({ nativeEvent: { features: [{ geometry: { type: 'Point' }, properties: {
    icon_category_0: 'roadWorks', description_0: ' Obras ', magnitude_of_delay: 'minor', road_category: 'street',
  } }] }, stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true);
  assert.deepEqual(selected, [{ category: 'Obras', description: 'Obras', severity: 'Tráfico lento' }]);
  const { incidentDetails } = h.load('src/map/incidentDetails.ts');
  assert.deepEqual(incidentDetails(null), {});
  assert.deepEqual(incidentDetails({ icon_category_0: 'unknown', description_0: {}, magnitude_of_delay: 'undefined' }),
    { category: undefined, description: undefined, severity: undefined });
  await h.act(async () => tree.unmount());
});
