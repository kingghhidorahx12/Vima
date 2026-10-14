import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import React from 'react';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import { driverSheetInteraction } from '../src/features/driver/driverViewport.ts';
import { advanceAssignmentView, initialAssignmentView } from '../src/features/passenger/assignmentMapView.ts';
import type { DriverState } from '../src/services/matching/contracts.ts';
import type { Assignment } from '../src/features/passenger/model.ts';
const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const pickup = { id: 'pickup', name: 'Recogida', address: 'Referencia pública', coordinate: [-99.88, 19.79] as const };
const route = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const,
  coordinates: [[-99.89, 19.8], [-99.885, 19.8], [-99.88, 19.79]] as [number, number][] } };
const assignment: Assignment = { id: 'assignment', pin: '1234', driver: { name: 'Driver', rating: 5 },
  vehicle: { name: 'Sedán', color: 'Blanco', plate: 'TEST' }, etaMinutes: 4, routeToOrigin: route,
  sample: { coordinate: [-99.9, 19.81], sequence: 1, heading: 45, capturedAt: Date.now() } };
const state = (phase: string, revision = 1): DriverState => ({ accountId: 'driver', revision,
  availability: ['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS'].includes(phase) ? 'ASSIGNED' : 'AVAILABLE', expiryCount: 0,
  profile: assignment, location: { coordinate: [-99.9 + revision / 10000, 19.81], receivedAt: Date.now() },
  ...(phase === 'OFFER' ? { offer: { id: 'offer', requestId: 'request', expiresAt: Date.now() + 10000, etaMinutes: 4, pickup } } : {}),
  ...(['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS'].includes(phase) ? { assignment: { requestId: 'request', state: phase as 'ASSIGNED',
    value: assignment, pickup, lifecycle: { completedStops: 0, incurredAdditionCodes: [] }, stops: [], additionCodes: [] } } : {}) });
const flatten = (styles: unknown): Record<string, unknown> => Object.assign({}, ...[styles].flat(Infinity).filter(Boolean));

test('Driver approved proportions and local snap range scale with useful Android frame, with no residual common height', () => {
  for (const height of [520, 640, 800]) for (const [phase, map, expanded] of [
    ['AVAILABLE', .64, .36], ['OFFER', .53, .47], ['ASSIGNED', .72, .52], ['IN_PROGRESS', .77, .48],
  ] as const) {
    const geometry = driverSheetInteraction(height, phase)!;
    assert.ok(Math.abs(geometry.targetOffset - height * map) < .001);
    assert.ok(Math.abs(geometry.minOffset - height * (1 - expanded)) < .001);
    assert.equal(geometry.settle(geometry.targetOffset, 0), geometry.targetOffset);
    assert.equal(geometry.settle(geometry.minOffset, 0), geometry.minOffset);
    assert.ok(geometry.allowedOffsets.every(offset => offset >= geometry.minOffset && offset <= geometry.maxOffset));
  }
  assert.equal(driverSheetInteraction(0), undefined);
  const withError = driverSheetInteraction(520, 'OFFER', 340)!;
  assert.equal(520 - withError.targetOffset, 340); // measured recovery stays wholly non-scroll
  assert.equal(withError.allowedOffsets.length, 1);
});

test('Passenger assignment entry includes actual car beyond pickup route, then GPS and lifecycle revisions retain camera identity', () => {
  const view = { coordinates: route.geometry.coordinates as readonly (readonly [number, number])[], bearing: 125, padding: { bottom: 280 } };
  const entered = advanceAssignmentView(initialAssignmentView, assignment, 'ASSIGNED', view, assignment.sample.coordinate);
  assert.deepEqual(entered.target?.coordinates?.at(-1), assignment.sample.coordinate);
  assert.equal(entered.target?.bearing, 125);
  for (const phase of ['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS']) {
    assert.equal(advanceAssignmentView(entered, { ...assignment, sample: { ...assignment.sample, sequence: 2, coordinate: [-99.8, 19.8] } },
      phase, view, [-99.8, 19.8]), entered);
  }
  const unavailable = advanceAssignmentView(initialAssignmentView, assignment, 'ASSIGNED', view);
  assert.equal(unavailable.acquired, false);
  assert.equal(unavailable.target, view);
  assert.equal(advanceAssignmentView(unavailable, assignment, 'ASSIGNED', view, assignment.sample.coordinate).acquired, true);
  assert.equal(advanceAssignmentView(entered, assignment, 'PAYMENT_PENDING', view), initialAssignmentView);
});

test('Driver camera uses measured occlusion, preserves manual inspection and recenters explicitly without fabricated offer route', async () => {
  const h = createMapHarness({ reduced: true, fileOverrides: {
    'src/design/components/VimaThemeToggle.tsx': { VimaThemeToggle: 'ThemeToggle' },
    'src/services/storage/mapLayers.ts': { mapLayerStorage: { read: async () => ({ traffic: false, incidents: false }), write: async () => {} } },
  } });
  const { useDriverMap } = h.load('src/features/driver/useDriverMap.tsx');
  function Scene({ snapshot, sheetHeight }: { snapshot: DriverState; sheetHeight: number }) {
    const value = useDriverMap(snapshot, true, { height: 640, sheetHeight });
    return React.createElement('Scene', value.map, value.mapContent, value.mapOverlay);
  }
  const element = (snapshot: DriverState, sheetHeight = 300) => React.createElement(Scene, { snapshot, sheetHeight });
  const tree: ReactTestRenderer = await h.render(element(state('OFFER')));
  const stops = () => h.calls.filter((c: unknown[]) => c[0] === 'setStop');
  try {
    assert.equal(stops().length, 0);
    const camera = tree.root.findByType('MapLibreCamera' as never);
    assert.ok(camera.props.initialViewState.bounds);
    await h.act(async () => tree.root.findByType('Scene' as never).props.onDidFinishLoadingMap());
    assert.equal(stops().at(-1)[1].padding.bottom, 340);
    assert.equal(tree.root.findAllByProps({ id: 'driver-pickup-route' }).length, 0);
    await h.act(async () => tree.root.findByType('Scene' as never).props.onTouchStart());
    const beforePan = stops().length;
    await h.act(async () => tree.update(element(state('OFFER', 2), 360)));
    assert.equal(stops().length, beforePan);
    const control = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Centrar ubicación')!;
    await h.act(async () => control.props.onPress());
    assert.deepEqual(stops().at(-1)[1].center, state('OFFER', 2).location!.coordinate);
    assert.equal(stops().at(-1)[1].padding.bottom, 400);
    await h.act(async () => tree.update(element(state('ASSIGNED', 3), 180)));
    assert.ok(tree.root.findByProps({ id: 'driver-pickup-route' }));
    assert.equal(stops().at(-1)[1].padding.bottom, 220);
    assert.equal(tree.root.findByType('MapLibreCamera' as never), camera);
    assert.equal(flatten(tree.root.findByProps({ testID: 'driver-map-controls' }).props.style).bottom, 192);
    assert.equal(tree.root.findByProps({ testID: 'driver-map-controls' }).props.pointerEvents, 'box-none');
  } finally { await h.act(async () => tree.unmount()); }
});

test('Driver operational primary actions stay outside scroll and all existing secondary actions remain available', async () => {
  for (const themeName of ['light', 'dark']) for (const phase of ['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS']) {
    const h = createHarness({}, { themeName });
    const { DriverMapPanel } = h.load('src/features/driver/DriverMapPanel.tsx');
    const { DriverLifecycleControls } = h.load('src/features/driver/DriverLifecycleControls.tsx');
    const snapshot = state(phase); const commands: unknown[] = []; const heights: number[] = [];
    const life = { assignment: snapshot.assignment, busy: false, queued: 0, onCommand: (c: unknown) => commands.push(c), onSync() {} };
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(React.createElement(DriverMapPanel, { state: snapshot, configured: true, connection: 'online',
      busy: false, error: 'Conexión inestable', retryAvailable: true, onAvailable() {}, onOffline() {}, onCancelAssignment() {}, onRetry() {},
      onMinimumHeight: (height: number) => heights.push(height),
      lifecycleControls: React.createElement(DriverLifecycleControls, { ...life, section: 'primary' }),
      lifecycleSecondary: React.createElement(DriverLifecycleControls, { ...life, section: 'secondary' }) })); });
    try {
      const critical = tree.root.findByProps({ testID: 'driver-critical-region' });
      const labels = critical.findAllByType('Pressable' as never).map(n => n.props.accessibilityLabel);
      assert.ok(labels.includes(phase === 'ASSIGNED' ? 'Llegué' : phase === 'ARRIVED_PICKUP' ? 'Iniciar viaje' : 'Finalizar viaje'));
      assert.ok(labels.includes('Reintentar acción'));
      assert.equal(critical.findAllByType('ScrollView' as never).length, 0);
      const secondary = tree.root.findByProps({ testID: 'driver-operational-secondary' });
      assert.ok(secondary.findAllByType('Pressable' as never).some(n => n.props.accessibilityLabel === 'Sincronizar viaje'));
      await act(async () => {
        tree.root.findByProps({ testID: 'driver-operational-summary' }).props.onLayout({ nativeEvent: { layout: { height: 60 } } });
        critical.props.onLayout({ nativeEvent: { layout: { height: 180 } } });
      });
      assert.equal(heights.at(-1), 280);
      assert.equal(critical.findAll(n => n.props.accessibilityRole === 'alert').length, 1);
    } finally { await act(async () => tree.unmount()); h.client.clear(); }
  }
});

test('QA tools retain a private route and DevMenu; no normal account overlay can intercept the map', () => {
  const gate = readFileSync('src/dev/LiveAccountGate.tsx', 'utf8');
  assert.doesNotMatch(gate, /Cuenta QA \/ cambiar modo|position: 'absolute'/);
  assert.match(gate, /registerDevMenuItems/);
  assert.match(gate, /useState\(accountTools\)/);
  assert.match(readFileSync('app/qa/account.tsx', 'utf8'), /EXPO_PUBLIC_VIMA_VARIANT === 'qa'/);
});
