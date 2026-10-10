import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { Assignment } from '../src/features/passenger/model.ts';
import type { RequestState } from '../src/services/matching/contracts.ts';
const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const route = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [.001, .001]] } } as const;
const assignment = (sequence = 1, capturedAt = Date.now()): Assignment => ({ id: 'assigned-only',
  driver: { name: 'Driver', rating: 5 }, vehicle: { name: 'Vima', plate: 'TEST', color: 'Blanco' }, etaMinutes: 1, pin: '1234',
  sample: { coordinate: [.0001 * sequence, .0001 * sequence], heading: 45, sequence, capturedAt, headingKnown: true },
  routeToOrigin: route as unknown as Assignment['routeToOrigin'] });

test('Passenger uses the same registered car and map-aligned heading in active phases; updates never recenter camera', async () => {
  for (const theme of ['light', 'dark']) for (const reduced of [false, true]) {
    const h = createMapHarness({ realMotion: true, reduced, fileOverrides: {
      'src/design/themes/index.tsx': { useVimaTheme: () => ({ name: theme, roles: { positive: '#00D68F' } }) },
    } });
    const { PassengerMap } = h.load('src/features/passenger/PassengerMap.tsx');
    const config = { viewport: () => ({ center: [0, 0], zoom: 14, bearing: 125, padding: {} }) };
    let a = assignment(); let phase: RequestState = 'ASSIGNED'; let home = false;
    const element = () => React.createElement(PassengerMap, { assignment: a, requestState: phase, config, home,
      ready: true, origin: null, destination: null, sheetHeight: 100 });
    const tree: ReactTestRenderer = await h.render(element());
    const read = () => JSON.parse(tree.root.findAllByType('MapLibreSource' as never)
      .find(n => n.props.id === 'passenger-assigned-vehicle-source')!.props.data);
    const settle = async () => { await h.flush(); h.frame(0); h.frame(1000); await h.act(async () => tree.update(element())); };
    try {
      await settle();
      const cameraCalls = h.calls.filter((c: unknown[]) => c[0] === 'setStop').length;
      for (const state of ['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS'] as const) {
        phase = state; a = assignment(a.sample.sequence + 1);
        await h.act(async () => tree.update(element())); await settle();
        assert.deepEqual(read().geometry.coordinates, a.sample.coordinate);
        assert.equal(read().properties.heading, 45);
        assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'setStop').length, cameraCalls);
      }
      const layers = tree.root.findAllByType('MapLibreLayer' as never);
      const car = layers.find(n => n.props.id === 'passenger-assigned-vehicle')!;
      assert.equal(car.props.type, 'symbol'); assert.equal(car.props.layout['icon-image'], `vima-driver-${theme}`);
      assert.equal(car.props.layout['icon-rotation-alignment'], 'map'); // camera bearing must not be added to heading
      assert.deepEqual(car.props.layout['icon-rotate'], ['get', 'heading']);
      assert.equal(layers.some(n => /-base$/.test(n.props.id)), false);
      assert.equal(layers.some(n => n.props.animatedProps), false);
      assert.ok(tree.root.findByType('MapLibreImages' as never).props.images[`vima-driver-${theme}`]);
      assert.deepEqual(validateStyleMin({ version: 8, sources: { vehicle: { type: 'geojson', data: read() } },
        layers: layers.map(n => ({ id: n.props.id, type: n.props.type, source: 'vehicle',
          ...(n.props.paint ? { paint: n.props.paint } : {}), ...(n.props.layout ? { layout: n.props.layout } : {}),
          ...(n.props.filter ? { filter: n.props.filter } : {}) })) }), []);
      if (reduced) assert.equal(read().properties.acquisition, 1);
      // Older revision cannot rewind a live marker, even with a fresh timestamp.
      a = assignment(1); await h.act(async () => tree.update(element())); await settle();
      assert.notDeepEqual(read().geometry.coordinates, a.sample.coordinate);
      for (const state of ['PAYMENT_PENDING', 'COMPLETED', 'CANCELLED', 'SEARCHING'] as const) {
        phase = state; await h.act(async () => tree.update(element())); await settle();
        assert.deepEqual(read().features, []);
      }
      phase = 'ASSIGNED'; home = true; a = assignment(10);
      await h.act(async () => tree.update(element())); await settle(); assert.deepEqual(read().features, []);
      home = false; a = { ...assignment(11), sample: { coordinate: [0, 0], heading: 90, sequence: 11 } };
      await h.act(async () => tree.update(element())); await settle(); assert.deepEqual(read().features, []); // old server isn't live
      a = assignment(12, Date.now() - 61000);
      await h.act(async () => tree.update(element())); await settle(); assert.deepEqual(read().features, []);
      a = assignment(13); await h.act(async () => tree.update(element())); await settle();
      assert.deepEqual(read().geometry.coordinates, a.sample.coordinate);
      assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'unmount' && c[1] === 'MapLibreSource').length, 0);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('freshness deadline/background recovery hides expired samples; new assignment cannot borrow heading', async () => {
  const realNow = Date.now; let now = realNow(); Date.now = () => now;
  const h = createMapHarness({ realMotion: true, reduced: true });
  const { VehicleMarker } = h.load('src/map/DriverVehicleMarker.tsx');
  let location = { coordinate: [0, 0], receivedAt: now, heading: 90 };
  let identity = 'a'; let sequence = 1;
  const element = () => React.createElement(VehicleMarker, { key: identity, location, sequence });
  const tree = await h.render(element());
  const settle = async () => { await h.flush(); await h.act(async () => tree.update(element())); };
  const read = () => JSON.parse(tree.root.findByType('MapLibreSource' as never).props.data);
  try {
    await settle(); assert.equal(read().properties.heading, 90);
    now += 61000; await h.act(async () => h.appState('active')); await settle(); assert.deepEqual(read().features, []);
    sequence++; location = { coordinate: [1, 1], heading: 45, receivedAt: now };
    await h.act(async () => tree.update(element())); await settle(); assert.equal(read().properties.heading, 45);
    identity = 'b'; sequence = 1; location = { coordinate: [2, 2], receivedAt: now, heading: undefined as unknown as number };
    await h.act(async () => tree.update(element())); await settle(); assert.equal(read().properties.heading, null);
  } finally { Date.now = realNow; await h.act(async () => tree.unmount()); }
});
