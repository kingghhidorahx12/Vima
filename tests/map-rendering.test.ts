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
  assert.equal(pins[0]!.findAllByType('View' as never)[1]!.props.style[1].backgroundColor, '#0B0F0E');
  assert.equal(pins[1]!.findAllByType('View' as never)[1]!.props.style[1].backgroundColor, '#FF3830');
  const line = tree.root.findAllByType('MapLibreLayer' as never).find(layer => layer.props.id === 'r')!.props;
  assert.equal(line.type, 'line');
  assert.equal(line.paint['line-width'], 4);
  const halo = tree.root.findAllByType('MapLibreLayer' as never).find(layer => layer.props.id === 'r-halo')!.props;
  assert.equal(halo.paint['line-color'], '#00826F');
  assert.ok(halo.paint['line-blur'] > 0);
  assert.ok(halo.paint['line-width'] > line.paint['line-width']);
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
  assert.equal(tree.root.findAllByType('MapLibreMarker' as never).length, 3);
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

test('confirmed route fit includes full geometry and useful viewport padding without replaying', async () => {
  for (const reduced of [false, true]) {
    const h = createMapHarness({ reduced });
    const { PassengerMap } = h.load('src/features/passenger/PassengerMap.tsx');
    const origin = { id: 'origin', name: 'Origen', address: '', coordinate: [-99, 19] };
    const destination = { id: 'destination', name: 'Destino', address: '', coordinate: [-98, 20] };
    const route = { type: 'Feature', properties: {}, geometry: { type: 'LineString',
      coordinates: [[-99, 19], [-99.4, 20.2], [-98, 20]] } };
    const config = { viewport: () => ({ center: [-99, 19], padding: { top: 16, bottom: 20 } }),
      route: { width: 4, opacity: 1 }, vehicle: { radius: 12, color: '#000' } };
    const scene = (sequence?: number) => React.createElement(PassengerMap, { origin, destination,
      quote: { origin, destination, route }, home: false, ready: true, sheetHeight: 310, config,
      cameraMode: 'user-controlled', fitRoute: sequence ? { sequence, coordinates: [origin.coordinate,
        ...route.geometry.coordinates, destination.coordinate] } : undefined });
    const tree: ReactTestRenderer = await h.render(scene());
    assert.equal(h.calls.filter((call: unknown[]) => call[0] === 'setStop').length, 0);
    await h.act(async () => tree.update(scene(1)));
    const stop = h.calls.filter((call: unknown[]) => call[0] === 'setStop').at(-1)?.[1] as {
      bounds: number[]; padding: { top: number; bottom: number; right: number }; duration: number };
    assert.ok(stop.bounds.every((value, index) => Math.abs(value - [-99.4, 19, -98, 20.2][index]!) < 1e-9));
    assert.equal(stop.padding.top, 16);
    assert.equal(stop.padding.bottom, 330);
    assert.ok(stop.padding.right >= 80);
    assert.equal(stop.duration, reduced ? 0 : 420);
    await h.act(async () => tree.update(scene(1)));
    assert.equal(h.calls.filter((call: unknown[]) => call[0] === 'setStop').length, 1);
    await h.act(async () => tree.unmount());
  }
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
    ['Traffic flow', 'Traffic incident flow', 'Traffic incident points', 'Traffic incident points']);
  await h.act(async () => tree.unmount());
});

test('Traffic toggling preserves blue route, halo and geometry with and without Reduced Motion', async () => {
  for (const reduced of [false, true]) {
    const h = createMapHarness({ reduced });
    const { PassengerMap } = h.load('src/features/passenger/PassengerMap.tsx');
    const origin = { id: 'o', name: 'Origen', address: '', coordinate: [-99, 19] };
    const destination = { id: 'd', name: 'Destino', address: '', coordinate: [-98, 20] };
    const route = { type: 'Feature', properties: {}, geometry: { type: 'LineString',
      coordinates: [[-99, 19], [-99.5, 19.5], [-98, 20]] } };
    const config = { viewport: () => ({ center: [-99, 19] }), route: { width: 4, opacity: 1 },
      vehicle: { radius: 12, color: '#000' } };
    const scene = (traffic: boolean) => React.createElement(PassengerMap, { origin, destination,
      quote: { origin, destination, route }, home: false, ready: true, sheetHeight: 300, config,
      displayKeyAvailable: true, layers: { traffic, incidents: true } });
    const tree: ReactTestRenderer = await h.render(scene(false));
    await h.act(async () => tree.update(scene(false))); // Settle initial reveal in the animation double.
    const source = () => tree.root.findAllByType('MapLibreSource' as never)
      .find(node => node.props.id === 'passenger-route-source')!;
    const before = source().props.data;
    const color = (data: string) => { const p = JSON.parse(data).properties; return [p.vimaRed, p.vimaGreen, p.vimaBlue]; };
    assert.deepEqual(color(before), [47, 128, 255]);
    assert.deepEqual(JSON.parse(before).geometry.coordinates, route.geometry.coordinates);
    await h.act(async () => tree.update(scene(true)));
    assert.deepEqual(JSON.parse(source().props.data).geometry, JSON.parse(before).geometry);
    assert.deepEqual(color(source().props.data), [47, 128, 255]);
    const layers = tree.root.findAllByType('MapLibreLayer' as never);
    const halo = layers.find(node => node.props.id === 'passenger-route-halo')!;
    const line = layers.find(node => node.props.id === 'passenger-route')!;
    assert.equal(halo.props.paint['line-color'], '#2F80FF');
    assert.ok(halo.props.paint['line-blur'] > 0);
    assert.ok(halo.props.paint['line-width'] > line.props.paint['line-width']);
    const trafficIndex = layers.findIndex(node => node.props.id === 'vima-traffic-flow-lines');
    assert.ok(trafficIndex >= 0 && layers.indexOf(halo) > trafficIndex);
    assert.equal(layers.some(node => node.props.id === 'passenger-route-flow'), !reduced);
    await h.act(async () => tree.unmount());
  }
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
  assert.deepEqual(selected, [{ category: 'Obras', icon: 'work', description: 'Obras', severity: 'Tráfico lento' }]);
  const { incidentDetails } = h.load('src/map/incidentDetails.ts');
  assert.deepEqual(incidentDetails(null), { category: 'Incidente vial' });
  assert.deepEqual(incidentDetails({ icon_category_0: 'unknown', description_0: {}, magnitude_of_delay: 'undefined' }),
    { category: 'Incidente vial', description: undefined, severity: undefined });
  assert.deepEqual(incidentDetails({ icon_category_0: 'roadClosed', description_0: 'Road closure', magnitude_of_delay: 'major' }),
    { category: 'Vía cerrada', icon: 'route', description: 'Cierre vial', severity: 'Tráfico detenido' });
  assert.equal(incidentDetails({ icon_category_0: 'fog', description_0: 'Fog reported ahead' }).description, undefined);
  await h.act(async () => tree.unmount());
});

test('location animates only its outer ring, stops in background and remains opaque under Reduced Motion', async () => {
  for (const reduced of [false, true]) {
    const h = createMapHarness({ reduced }); const { PassengerUserLocation } = h.load('src/features/passenger/PassengerMapPin.tsx');
    const place = { id: 'p', coordinate: [0, 0] };
    const tree: ReactTestRenderer = await h.render(React.createElement(PassengerUserLocation, { place }));
    const core = tree.root.findAllByType('View' as never).find(node => node.props.style?.backgroundColor === '#2F80FF');
    assert.ok(core); assert.equal(core.props.style.opacity, 1);
    assert.equal(h.calls.some((c: unknown[]) => c[0] === 'repeat'), !reduced);
    const repeats = h.calls.filter((c: unknown[]) => c[0] === 'repeat').length;
    await h.act(async () => h.appState('background'));
    assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'repeat').length, repeats);
    const before = h.calls.filter((c: unknown[]) => c[0] === 'cancelAnimation').length;
    await h.act(async () => tree.unmount());
    assert.ok(h.calls.filter((c: unknown[]) => c[0] === 'cancelAnimation').length > before);
  }
});

test('route reveals once then repeats a separate highlight; reduced/background disable repetition', async () => {
  for (const reduced of [false, true]) {
    const h = createMapHarness({ reduced }); const { RouteLayer } = h.load('src/map/RouteLayer.tsx');
    const data = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] } };
    const scene = (active = true) => React.createElement(RouteLayer, { id: 'test', data, state: 'active', activeTone: 'greenDark', appearance: { width: 4, opacity: 1 }, active });
    const tree: ReactTestRenderer = await h.render(scene());
    assert.equal(h.calls.some((c: unknown[]) => c[0] === 'repeat'), !reduced);
    assert.equal(tree.root.findAllByType('MapLibreSource' as never).length, reduced ? 1 : 2);
    const mounts = h.calls.filter((c: unknown[]) => c[0] === 'mount').length;
    await h.act(async () => tree.update(scene(false)));
    assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'mount').length, mounts);
    assert.ok(h.calls.some((c: unknown[]) => c[0] === 'timing' && (c[2] as { duration: number }).duration === (reduced ? 160 : 720)));
    await h.act(async () => tree.unmount());
  }
});

test('native traffic and incident layers fade at toggle boundaries and preserve tap targets', async () => {
  const h = createMapHarness(); const { IncidentLayer } = h.load('src/map/IncidentLayer.tsx');
  const scene = (enabled: boolean) => React.createElement(IncidentLayer, { enabled, onSelect: () => {} });
  const tree: ReactTestRenderer = await h.render(scene(true));
  await h.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  const points = () => tree.root.findAllByType('MapLibreLayer' as never).find(n => n.props.id === 'vima-incident-points')!;
  assert.equal(points().props.paint['circle-opacity'], 1); assert.equal(points().props.paint['circle-radius-transition'].duration, 600);
  await h.act(async () => tree.update(scene(false)));
  await h.act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  assert.equal(points().props.paint['circle-opacity'], 0);
  assert.equal(tree.root.findByType('MapLibreVectorSource' as never).props.onPress, undefined);
  await h.act(async () => tree.unmount());
});

test('launch starts exit as soon as ready and reduced motion only crossfades', async () => {
  for (const reduced of [false, true]) {
    const h = createMapHarness({ reduced }); const { VimaLaunchSurface } = h.load('src/motion/VimaLaunchSurface.tsx');
    const tree: ReactTestRenderer = await h.render(React.createElement(VimaLaunchSurface, { ready: false }));
    assert.equal(h.calls.some((c: unknown[]) => c[0] === 'timing' && c[1] === 1.01), !reduced);
    await h.act(async () => tree.update(React.createElement(VimaLaunchSurface, { ready: true })));
    assert.equal(tree.root.findAllByType('View' as never)[0]!.props.pointerEvents, 'none');
    assert.ok(h.calls.some((c: unknown[]) => c[0] === 'timing' && c[1] === 0 && (c[2] as { duration: number }).duration === (reduced ? 160 : 480)));
    assert.ok(!h.calls.some((c: unknown[]) => c[0] === 'repeat' || c[0] === 'delay'));
    await h.act(async () => tree.unmount());
  }
});

test('both passenger fit intents use measured occlusion and exclude exterior margins/nav under either motion policy', async () => {
  for (const reduced of [false, true]) {
    const h = createMapHarness({ reduced }); const { PassengerMap } = h.load('src/features/passenger/PassengerMap.tsx');
    const origin = { id: 'o', coordinate: [-99, 19] }; const destination = { id: 'd', coordinate: [-98, 20] };
    const coordinates = [origin.coordinate, [-100, 22], [-97, 21], destination.coordinate];
    const route = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
    const config = { viewport: () => ({ center: [-99, 19], padding: { top: 24, bottom: 20, left: 20, right: 20 } }),
      route: { width: 4, opacity: 1 }, vehicle: { radius: 12, color: '#000' } };
    const scene = (sequence: number, measuredHeight: number, search = false, estimatedHeight = 500) => React.createElement(PassengerMap, {
      quote: { origin, destination, route }, origin, destination, home: false, ready: true, sheetHeight: estimatedHeight,
      topOcclusion: 92, config, cameraMode: 'user-controlled', searchPresentationActive: search,
      fitRoute: { sequence, sheetHeight: measuredHeight, coordinates },
    });
    const tree: ReactTestRenderer = await h.render(scene(1, 280));
    const stops = () => h.calls.filter((call: unknown[]) => call[0] === 'setStop');
    try {
      assert.equal(stops().length, 1);
      const first = stops()[0][1];
      assert.deepEqual(first.bounds, [-100, 19, -97, 22]);
      assert.deepEqual(first.padding, { top: 92, bottom: 300, left: 20, right: 80 });
      assert.equal(first.duration, reduced ? 0 : 420);
      await h.act(async () => tree.update(scene(1, 282, false, 550)));
      assert.equal(stops().length, 1); // Height/target recomposition is not a fit trigger.
      await h.act(async () => tree.update(scene(2, 390, true)));
      assert.equal(stops().length, 1); // Search rejects even a new sequence.
      await h.act(async () => tree.update(scene(2, 390)));
      assert.equal(stops().length, 2);
      assert.equal(stops()[1][1].padding.bottom, 410);
      assert.equal(stops()[1][1].duration, reduced ? 0 : 420);
      await h.act(async () => tree.update(scene(2, 392)));
      assert.equal(stops().length, 2);
    } finally { await h.act(async () => tree.unmount()); }
  }
});
