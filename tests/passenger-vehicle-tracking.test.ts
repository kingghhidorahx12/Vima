import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { advancePassengerTracking as advance, passengerTrackingPresentation as present, observedDistance,
  type ObservedVehicleFix, type PassengerTrackingState, type PassengerVehicleTracking } from '../src/map/passengerVehicleTracking.ts';
import type { Coordinate } from '../src/map/models.ts';
import type { DriverVehiclePose, DriverVehicleSample } from '../src/map/vehicleMotion.ts';
import type { SharedValue } from 'react-native-reanimated';
import type { ReactTestRenderer } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const start = 1_800_000_000_000;
const fix = (sequence: number, coordinate: Coordinate = [0, 0], heading?: number, time = start + sequence * 1000): ObservedVehicleFix =>
  ({ sequence, coordinate, receivedAt: time, ...(heading === undefined ? {} : { heading }) });
const accept = (s: PassengerTrackingState, f: ObservedVehicleFix) => advance(s, f, true, f.receivedAt);
const near = (actual: number | null | undefined, expected: number) => assert.ok(actual !== null && actual !== undefined &&
  Math.abs(((actual - expected + 540) % 360) - 180) < 0.1, `${actual} != ${expected}`);

test('GPS headings follow observed straight/diagonal travel through all 360°, not a road axis or route', () => {
  const cases: [Coordinate, number][] = [[[.0001, 0], 90], [[-.0001, 0], 270], [[0, .0001], 0],
    [[0, -.0001], 180], [[.0001, .0001], 45], [[-.0001, -.0001], 225]];
  for (const [coordinate, course] of cases) {
    const first = accept({}, fix(1)); const next = accept(first, fix(2, coordinate, 180));
    near(next.visual?.heading, course);
    assert.deepEqual(next.visual?.fix.coordinate, coordinate);
    assert.deepEqual(next.observed, fix(2, coordinate, 180)); // visual bearing cannot rewrite GPS
  }
  let s = accept({}, fix(1)); s = accept(s, fix(2, [.0001, 0]));
  s = accept(s, fix(3, [.0001, .0001])); near(s.visual?.heading, 0); // real turn
});

test('parking/noisy GPS preserves course; unknown/obsolete heading stays unknown until significant movement', () => {
  let s = accept({}, fix(1, [0, 0], 90));
  for (let i = 2; i < 20; i++) { s = accept(s, fix(i, [i % 2 ? .000005 : -.000005, 0], i * 15)); near(s.visual?.heading, 90); }
  const old = fix(21, [0, 0], 270, start + 80_000); s = accept(s, old);
  assert.equal(s.visual?.heading, null); assert.equal(s.visual?.reconnected, true);
  s = accept(s, fix(22, [.000001, 0], 270, old.receivedAt + 1000)); assert.equal(s.visual?.heading, null);
  s = accept(s, fix(23, [.0001, 0], undefined, old.receivedAt + 2000)); near(s.visual?.heading, 90);
});

test('duplicates, reordered timestamps/sequences, invalid/future coordinates cannot rewind the display', () => {
  const first = fix(10, [19, 20], 359); const s = accept({}, first);
  for (const f of [first, fix(9, [0, 0]), fix(11, [0, 0], 90, first.receivedAt - 1),
    fix(11, [NaN, 0]), fix(11, [181, 0]), fix(-1), fix(11, [0, 0], 0, first.receivedAt + 5001)]) {
    assert.equal(advance(s, f, true, first.receivedAt), s);
  }
  assert.equal(accept({}, fix(1, [0, 0], NaN)).visual?.heading, null);
});

test('a large isolated jump is quarantined visually; a second coherent fix reacquires without an invented connecting path', () => {
  const first = fix(1); let s = accept({}, first);
  const jump = fix(2, [.1, .1], 150); s = accept(s, jump);
  assert.deepEqual(s.observed, jump); assert.deepEqual(s.visual?.fix, first);
  assert.equal(present(s, true, jump.receivedAt).paused, true);
  assert.match(present(s, true, jump.receivedAt).message, /discontinua/);
  const follow = fix(3, [.1001, .1001], 150); s = accept(s, follow);
  assert.deepEqual(s.visual?.fix.coordinate, follow.coordinate);
  assert.equal(s.visual?.reconnected, true); assert.equal(s.visual?.heading, null);
  // A single bad fix followed by the original street never moves to the outlier.
  s = accept(accept({}, first), jump); s = accept(s, fix(3, [.0001, 0]));
  assert.deepEqual(s.visual?.fix.coordinate, [.0001, 0]); assert.equal(s.pending, undefined);
});

test('parallel streets and rural/tunnel samples never project onto any road or planned line', () => {
  let s: PassengerTrackingState = {};
  for (let i = 1; i <= 8; i++) {
    const coordinate: Coordinate = [-99 + i * .0001, 19 + (i % 2) * .00002];
    const f = Object.freeze(fix(i, Object.freeze(coordinate), 90)); s = accept(s, f);
    assert.deepEqual(s.visual?.fix.coordinate, f.coordinate); assert.equal(f.heading, 90);
  }
  const last = s.visual!.fix;
  assert.equal(present(s, true, last.receivedAt + 9000).freshness, 'recent');
  assert.equal(present(s, true, last.receivedAt + 10000).freshness, 'delayed');
  assert.equal(present(s, true, last.receivedAt + 60000).freshness, 'expired');
  const expired = present(s, false, last.receivedAt + 240_000);
  assert.deepEqual(expired.state.visual!.fix, last); assert.match(expired.message, /Sin conexión.*4 min/);
  assert.equal(expired.paused, true); assert.equal(expired.opacity, .5);
  const resumed = fix(20, [-98.999, 19.0001], undefined, last.receivedAt + 250_000); s = accept(s, resumed);
  assert.equal(s.visual?.reconnected, true); assert.equal(s.visual?.heading, null);
  assert.deepEqual(s.visual?.fix.coordinate, resumed.coordinate);
  assert.ok(observedDistance([179.999, 0], [-179.999, 0]) < 230);
});

test('disconnect retains last known GPS and waits for a new fix after reconnection', () => {
  const a = fix(1, [0, 0], 45); const first = accept({}, a);
  let s = advance(first, a, false, a.receivedAt + 500);
  const b = fix(2, [.0001, .0001]); s = advance(s, b, false, b.receivedAt);
  assert.deepEqual(s.observed, b); assert.deepEqual(s.visual?.fix, a);
  s = advance(s, b, true, b.receivedAt); assert.equal(present(s, true, b.receivedAt).paused, true);
  assert.match(present(s, true, b.receivedAt).message, /Recuperando ubicación/);
  s = accept(s, fix(3, [.0002, .0002])); assert.equal(s.visual?.reconnected, true);
  assert.equal(present(s, true, s.visual!.fix.receivedAt).paused, false);
  const restored = advance({}, a, false, a.receivedAt + 120_000);
  assert.equal(present(restored, false, a.receivedAt + 120_000).freshness, 'expired');
  assert.equal(restored.visual?.heading, null);
});

test('real hook resets assignment, retains an aged restored snapshot, refreshes on deadlines/background and cleans timers', async t => {
  const originalNow = Date.now; let now = start + 1000; Date.now = () => now;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = createMapHarness(); const { usePassengerAssignmentTracking } = h.load('src/map/usePassengerVehicleTracking.ts');
  let identity = 'a'; let sequence = 1; let phase = 'ASSIGNED'; let online = true;
  let capturedAt = now; let result!: PassengerVehicleTracking;
  function Probe() { result = usePassengerAssignmentTracking({ id: identity, sample: { coordinate: [0, 0], sequence, capturedAt, heading: 45 } }, phase, online); return null; }
  const tree = await h.render(React.createElement(Probe));
  const update = () => h.act(async () => tree.update(React.createElement(Probe)));
  try {
    assert.equal(result.freshness, 'recent'); near(result.state.visual?.heading, 45);
    now += 10000; await h.act(async () => t.mock.timers.tick(10000)); assert.equal(result.freshness, 'delayed');
    now += 50000; await h.act(async () => h.appState('active')); assert.equal(result.freshness, 'expired');
    assert.ok(result.state.visual); assert.match(result.message, /caducados/);
    identity = 'b'; sequence = 1; capturedAt = now - 120000; await update();
    assert.equal(result.state.observed?.sequence, 1); assert.equal(result.state.visual?.heading, null);
    phase = 'PAYMENT_PENDING'; await update(); assert.equal(result.state.visual, undefined);
    phase = 'IN_PROGRESS'; capturedAt = now; await update(); assert.equal(result.freshness, 'recent');
    await h.act(async () => h.appState('background')); assert.equal(result.paused, true);
    await h.act(async () => h.appState('active')); assert.equal(result.paused, true); // waits for an actual new fix
    sequence++; capturedAt++; await update(); assert.equal(result.paused, false);
    online = false; await update(); assert.match(result.message, /Sin conexión/);
  } finally { await h.act(async () => tree.unmount()); t.mock.timers.reset(); Date.now = originalNow; }
});

test('real Passenger motion stops mid-interpolation on loss; no extrapolation or React renders per frame; null course replaces stale heading', async () => {
  const h = createMapHarness({ realMotion: true });
  const { useVehicleMotion } = h.load('src/map/useVehicleMotion.ts');
  let paused = false; let renders = 0; let pose!: SharedValue<DriverVehiclePose | null>;
  const config = { durationMs: 1000, easing: (p: number) => p, shouldSnap: () => false };
  function Probe() { renders++; pose = useVehicleMotion(h.sample, config, { driver: true, essential: false, paused, replaceHeading: true }); return null; }
  const tree = await h.render(React.createElement(Probe));
  const sample = async (f: DriverVehicleSample) => { h.sample.set(f); await h.flush(); };
  try {
    await sample({ coordinate: [0, 0], heading: 359, sequence: 1 });
    await sample({ coordinate: [.0001, 0], heading: 0, sequence: 2 });
    h.frame(0); h.frame(500); const middle = pose.get(); assert.ok(middle!.coordinate[0] > 0 && middle!.coordinate[0] < .0001);
    const count = renders; h.frame(600); h.frame(700); assert.equal(renders, count);
    paused = true; await h.act(async () => tree.update(React.createElement(Probe))); await h.flush(); const stopped = pose.get();
    assert.deepEqual(stopped, { coordinate: [.0001, 0], heading: 0 }); // Exact accepted GPS, not the mid-tween coordinate.
    h.frame(900); h.frame(15000); assert.deepEqual(pose.get(), stopped);
    await sample({ coordinate: [.00015, 0], heading: 1, sequence: 3 });
    assert.deepEqual(pose.get(), { coordinate: [.00015, 0], heading: 1 }); // Policy-accepted fix during pause: no tween.
    await sample({ coordinate: [1, 1], heading: 200, sequence: 2 });
    assert.deepEqual(pose.get(), { coordinate: [.00015, 0], heading: 1 });
    paused = false; await h.act(async () => tree.update(React.createElement(Probe)));
    await sample({ coordinate: [.0002, 0], heading: null, sequence: 4, reconnected: true });
    assert.deepEqual(pose.get(), { coordinate: [.0002, 0], heading: null });
    h.frame(20000); assert.deepEqual(pose.get(), { coordinate: [.0002, 0], heading: null });
  } finally { await h.act(async () => tree.unmount()); }
});

test('Passenger policy and real motion pause exactly at GPS on disconnect/background/expiry, including Reduced Motion', async () => {
  const originalNow = Date.now;
  try { for (const reason of ['offline', 'background', 'expired']) for (const reduced of [false, true]) {
    let now = start + 1000; Date.now = () => now;
    const h = createMapHarness({ realMotion: true, reduced });
    const { usePassengerVehicleTracking } = h.load('src/map/usePassengerVehicleTracking.ts');
    const { useVehicleMotion } = h.load('src/map/useVehicleMotion.ts');
    let incoming = fix(1, [0, 0], 359); let online = true;
    let pose!: SharedValue<DriverVehiclePose | null>;
    const config = { durationMs: 1000, easing: (p: number) => p, shouldSnap: () => false };
    function Probe() {
      const tracking = usePassengerVehicleTracking('assignment', incoming, online);
      const visual = tracking.state.visual;
      React.useEffect(() => { if (visual) h.sample.set({ coordinate: visual.fix.coordinate,
        heading: visual.heading, sequence: visual.fix.sequence, reconnected: visual.reconnected }); }, [visual]);
      pose = useVehicleMotion(h.sample, config, { driver: true, essential: false, paused: tracking.paused, replaceHeading: true });
      return null;
    }
    const tree = await h.render(React.createElement(Probe));
    const update = async () => { await h.act(async () => tree.update(React.createElement(Probe))); await h.flush(); };
    try {
      await h.flush(); now += 1000; incoming = fix(2, [.0001, 0], 90); await update();
      h.frame(0); h.frame(500);
      if (!reduced) assert.notDeepEqual(pose.get()!.coordinate, incoming.coordinate);
      if (reason === 'offline') { online = false; await update(); }
      else { if (reason === 'expired') now += 61000; await h.act(async () => h.appState(reason === 'background' ? 'background' : 'active')); await h.flush(); }
      assert.deepEqual(pose.get(), { coordinate: [.0001, 0], heading: 90 });
      h.frame(20000); assert.deepEqual(pose.get()!.coordinate, [.0001, 0]);
      now += 1000; incoming = fix(3, [.0002, 0], undefined, now); await update();
      assert.deepEqual(pose.get()!.coordinate, reason === 'expired' ? [.0002, 0] : [.0001, 0]);
      online = true; await h.act(async () => h.appState('active'));
      now += 1000; incoming = fix(4, [.0003, 0], undefined, now); await update();
      if (reason === 'expired') { h.frame(30000); h.frame(31000); } // The prior fresh fix already completed readquisition.
      assert.deepEqual(pose.get()!.coordinate, [.0003, 0]); // Readquisition, not a tween through the missing interval.
    } finally { await h.act(async () => tree.unmount()); }
  } } finally { Date.now = originalNow; }
});

test('last-known Passenger sedan uses valid normal layers and the approved asset in light/dark and Reduced Motion', async () => {
  for (const theme of ['light', 'dark']) for (const reduced of [false, true]) {
    const h = createMapHarness({ realMotion: true, reduced, fileOverrides: {
      'src/design/themes/index.tsx': { useVimaTheme: () => ({ name: theme, roles: { positive: '#00D68F' } }) },
    } });
    const { VehicleMarker } = h.load('src/map/DriverVehicleMarker.tsx');
    const location = { coordinate: [-99, 19], receivedAt: Date.now() - 120000 };
    const tree: ReactTestRenderer = await h.render(React.createElement(VehicleMarker, { location, sequence: 1,
      presentation: { paused: true, opacity: .5, reconnected: true } }));
    try {
      await h.flush(); await h.act(async () => tree.update(React.createElement(VehicleMarker, { location, sequence: 1,
        presentation: { paused: true, opacity: .5, reconnected: true } })));
      const data = JSON.parse(tree.root.findByType('MapLibreSource' as never).props.data);
      assert.deepEqual(data.geometry.coordinates, location.coordinate); assert.equal(data.properties.heading, null);
      if (reduced) assert.equal(data.properties.acquisition, 1);
      assert.equal(h.calls.some((call: unknown[]) => call[0] === 'timing'), false); // old GPS must not signal a new acquisition
      const layers = tree.root.findAllByType('MapLibreLayer' as never).map(n => ({ id: n.props.id, type: n.props.type,
        ...(n.props.paint ? { paint: n.props.paint } : {}), ...(n.props.layout ? { layout: n.props.layout } : {}),
        ...(n.props.filter ? { filter: n.props.filter } : {}) }));
      assert.deepEqual(validateStyleMin({ version: 8, sources: { gps: { type: 'geojson', data } },
        layers: layers.map(layer => ({ ...layer, source: 'gps' })) }), []);
      assert.equal(layers.find(l => l.type === 'symbol')!.layout['icon-image'], `vima-driver-${theme}`);
      assert.equal(layers.find(l => l.type === 'symbol')!.paint['icon-opacity'], .5);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('Passenger panel exposes last-known age without claiming Driver is online; no tracking notice after terminal phase', async () => {
  const h = createMapHarness({ fileOverrides: {
    'src/design/primitives/index.tsx': { VimaText: 'Text' },
    'src/design/components/VimaGlyph.tsx': { VimaGlyph: 'Glyph' },
    'src/design/components/VimaButton.tsx': { VimaButton: 'Button' },
    'src/features/passenger/PlaceThumbnail.tsx': { PlaceThumbnail: 'Thumbnail' },
  } });
  const { JourneyStatus } = h.load('src/features/passenger/PassengerJourneySummary.tsx');
  const vehicleTracking = present(accept({}, fix(1)), true, start + 62000);
  let requestState = 'ASSIGNED';
  const element = () => React.createElement(JourneyStatus, { trip: { requestState, assignment: { etaMinutes: 3 } }, vehicleTracking });
  const tree: ReactTestRenderer = await h.render(element());
  try {
    const notice = () => tree.root.findAll(n => n.props.testID === 'passenger-vehicle-freshness');
    assert.match(notice()[0]!.props.children, /Última ubicación hace 1 min.*caducados/);
    for (const state of ['ARRIVED_PICKUP', 'IN_PROGRESS']) {
      requestState = state;
      await h.act(async () => tree.update(React.createElement(JourneyStatus, { trip: { requestState,
        quote: { destination: { name: 'Destino real' } } }, vehicleTracking })));
      assert.ok(notice().length);
    }
    requestState = 'PAYMENT_PENDING'; await h.act(async () => tree.update(element())); assert.equal(notice().length, 0);
  } finally { await h.act(async () => tree.unmount()); }
});

test('display-only policy cannot call Snap, read planned roads or write authoritative telemetry/lifecycle/price', () => {
  const source = readFileSync('src/map/passengerVehicleTracking.ts', 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|routeToOrigin|quote\.|telemetry\(|settlement\(|snapToRoads|api\.tomtom/);
  const marker = readFileSync('src/map/DriverVehicleMarker.tsx', 'utf8');
  assert.doesNotMatch(marker, /AnimatedLayer|createAnimatedComponent\(Layer\)|animatedProps=.*Layer/);
  const worklet = readFileSync('src/map/vehicleMotion.ts', 'utf8').split('export function interpolateDriverVehiclePose')[1]!.split('export const vehicleUpdatesPerSecond')[0]!;
  assert.match(worklet, /'worklet'/); assert.doesNotMatch(worklet, /interpolateCoordinate|interpolateHeading/);
});
