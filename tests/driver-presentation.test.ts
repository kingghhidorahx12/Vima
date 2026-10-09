import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { darkTheme } from '../src/design/themes/dark.ts';
import { lightTheme } from '../src/design/themes/light.ts';
import { resolveVimaThemeName } from '../src/design/themes/resolve.ts';
import { driverConnectionLabel, driverGpsLabel, driverMapFallback, driverPresentation,
  driverSurfaceVariant } from '../src/features/driver/driverPresentation.ts';
import type { DriverState } from '../src/services/matching/contracts.ts';
import type { LifecycleCommand } from '../src/services/matching/lifecycle.ts';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

const place = { id: 'pickup', name: 'Plaza', address: 'Centro', coordinate: [-99.88, 19.79] as [number, number] };
const profile = { driver: { name: 'Conductor', rating: 4.9 }, vehicle: { name: 'Auto', plate: 'VIMA', color: 'Blanco' } };
const state = (availability: DriverState['availability']): DriverState => ({ accountId: 'private', revision: 2,
  availability, expiryCount: 0, profile, ...(['LOCATING', 'AVAILABLE'].includes(availability) ? {
    location: { coordinate: place.coordinate, receivedAt: 1 },
  } : {}), ...(availability === 'ASSIGNED' ? { assignment: { requestId: 'request', pickup: place, state: 'ASSIGNED' as const, lifecycle: { completedStops: 0, incurredAdditionCodes: [] }, stops: [], additionCodes: [],
    value: { id: 'assignment', driver: profile.driver, vehicle: profile.vehicle, etaMinutes: 7,
      sample: { coordinate: place.coordinate, heading: 0, sequence: 1 },
      routeToOrigin: { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const,
        coordinates: [place.coordinate, [-99.87, 19.8]] },
    } } } } : {}) });

test('lifecycle controls share themes, emit typed actions and never fabricate confirmation', async () => {
  for (const themeName of ['light', 'dark'] as const) {
    const h = createHarness({}, { themeName });
    const { DriverLifecycleControls } = h.load('src/features/driver/DriverLifecycleControls.tsx');
    const commands: LifecycleCommand[] = [];
    let tree!: ReactTestRenderer;
    const assignment = state('ASSIGNED').assignment!;
    const props = { assignment, busy: false, queued: 0, onSync() {}, onCommand: (c: LifecycleCommand) => commands.push(c) };
    await act(async () => { tree = create(React.createElement(DriverLifecycleControls, props)); });
    const press = (label: string) => tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label)!;
    await act(async () => press('Llegué').props.onPress()); assert.deepEqual(commands.at(-1), { name: 'arrive' });
    assignment.state = 'ARRIVED_PICKUP'; assignment.lifecycle.arrivedAt = 1000;
    await act(async () => tree.update(React.createElement(DriverLifecycleControls, props)));
    const input = tree.root.findByType('TextInput' as never);
    await act(async () => input.props.onChangeText('1234'));
    await act(async () => press('Iniciar viaje').props.onPress()); assert.deepEqual(commands.at(-1), { name: 'start', pin: '1234' });
    assert.equal(input.props.value, ''); // Driver entry is transient; assignment never supplies it.
    assignment.state = 'IN_PROGRESS'; assignment.lifecycle.startedAt = 2000;
    assignment.lifecycle.meter = { lastSequence: 1, distanceMeters: 0, durationSeconds: 0 };
    await act(async () => tree.update(React.createElement(DriverLifecycleControls, props)));
    await act(async () => press('Finalizar anticipadamente').props.onPress());
    assert.deepEqual(commands.at(-1), { name: 'finish', kind: 'early', finalTelemetrySequence: 1 });
    assert.equal(tree.root.findAllByType('TextInput' as never).length, 0);
    assert.equal(assignment.state, 'IN_PROGRESS');
    await act(async () => tree.unmount());
  }
});

test('Driver presentation maps real states to compact and operational critical actions', () => {
  assert.deepEqual(['OFFLINE', 'LOCATING', 'AVAILABLE', 'PAUSED'].map(value => driverSurfaceVariant(value as DriverState['availability'])),
    ['compact', 'compact', 'compact', 'compact']);
  assert.equal(driverSurfaceVariant('ASSIGNED'), 'operational');
  assert.deepEqual(driverPresentation(state('OFFLINE')), { availability: 'OFFLINE', variant: 'compact',
    title: 'No estás disponible', copy: 'Conéctate para empezar a recibir solicitudes.', tone: 'neutral',
    action: 'availability_available', actionLabel: 'Disponible' });
  assert.equal(driverPresentation(state('LOCATING')).actionLabel, 'Desconectarme');
  assert.equal(driverPresentation(state('AVAILABLE')).actionLabel, 'Desconectarme');
  assert.equal(driverPresentation(state('PAUSED')).actionLabel, 'Volver a estar disponible');
  assert.equal(driverPresentation(state('ASSIGNED')).actionLabel, 'Cancelar asignación');
});

test('human GPS and connectivity statuses expose no telemetry or identifiers', () => {
  assert.deepEqual(driverConnectionLabel('online'), { label: 'En línea', tone: 'positive' });
  assert.equal(driverConnectionLabel('reconnecting').label, 'Conexión inestable');
  assert.equal(driverConnectionLabel('offline').label, 'Sin conexión');
  assert.equal(driverGpsLabel(state('AVAILABLE'), '').label, 'Ubicación precisa');
  assert.equal(driverGpsLabel(state('LOCATING'), '').label, 'Ubicación precisa');
  assert.equal(driverGpsLabel(state('LOCATING'), 'Activa los servicios de ubicación').label, 'Sin ubicación');
});

async function renderPanel(driverState: DriverState, options: { error?: string; retryAvailable?: boolean;
  themeName?: 'light' | 'dark' } = {}) {
  const h = createHarness({}, { themeName: options.themeName ?? 'light' });
  const { DriverStatePanel } = h.load('src/features/driver/DriverStatePanel.tsx');
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(DriverStatePanel, { state: driverState, connection: 'online',
    configured: true, busy: false, error: options.error ?? '', retryAvailable: options.retryAvailable ?? false,
    onAvailable() {}, onOffline() {}, onCancelAssignment() {}, onRetry() {} })); });
  return { h, tree };
}

const actionLabels = (node: ReactTestInstance) =>
  node.findAllByType('Pressable' as never).map(button => button.props.accessibilityLabel);
const visibleText = (node: ReactTestInstance) => node.findAllByType('Text' as never)
  .flatMap(text => [text.props.children].flat(Infinity))
  .filter(value => typeof value === 'string' || typeof value === 'number').join(' ');

test('OFFLINE, LOCATING, AVAILABLE and PAUSED keep recovery actions in the non-scroll critical region', async () => {
  const cases = [
    { value: state('OFFLINE'), labels: ['Disponible'] },
    { value: state('LOCATING'), labels: ['Desconectarme', 'Reintentar acción'], error: 'No se pudo obtener tu ubicación.' },
    { value: state('AVAILABLE'), labels: ['Desconectarme'] },
    { value: state('PAUSED'), labels: ['Volver a estar disponible'] },
  ];
  for (const item of cases) {
    const { h, tree } = await renderPanel(item.value, { error: item.error, retryAvailable: !!item.error });
    try {
      const critical = tree.root.findByProps({ testID: 'driver-critical-region' });
      assert.deepEqual(actionLabels(critical), item.labels);
      assert.equal(critical.findAllByType('ScrollView' as never).length, 0);
      assert.equal(tree.root.findAllByType('ScrollView' as never).length, 0);
      if (item.error) assert.equal(critical.findAll(node => node.props.accessibilityRole === 'alert').length, 1);
    } finally { await act(async () => tree.unmount()); h.client.clear(); }
  }
});

test('ASSIGNED keeps pickup and cancellation visible while only vehicle detail may scroll', async () => {
  const { h, tree } = await renderPanel(state('ASSIGNED'));
  try {
    const context = tree.root.findByProps({ testID: 'driver-state-context' });
    const secondary = tree.root.findByProps({ testID: 'driver-secondary-content' });
    const critical = tree.root.findByProps({ testID: 'driver-critical-region' });
    assert.match(visibleText(context), /Recogida/);
    assert.equal(actionLabels(critical).at(0), 'Cancelar asignación');
    assert.equal(critical.findAllByType('ScrollView' as never).length, 0);
    assert.equal(secondary.type, 'ScrollView');
    assert.doesNotMatch(visibleText(tree.root), /private|request|assignment|1234/);
  } finally { await act(async () => tree.unmount()); h.client.clear(); }
});

test('Offer keeps countdown, long pickup, ETA and both decisions in a bounded non-scroll surface', async () => {
  const h = createHarness();
  const { DriverOffer } = h.load('src/features/driver/DriverOffer.tsx');
  const offer = { id: 'offer', requestId: 'request', expiresAt: 20_000, etaMinutes: 4,
    pickup: { ...place, name: 'Nombre de recogida deliberadamente largo que debe truncarse',
      address: 'Dirección pública larga con varias referencias que conserva su accesibilidad completa' } };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(DriverOffer, { offer, revision: 3, now: 1_000,
    disabled: false, onAccept() {}, onReject() {}, trace() {} })); });
  try {
    const context = tree.root.findByProps({ testID: 'driver-offer-context' });
    const actions = tree.root.findByProps({ testID: 'driver-offer-critical-actions' });
    assert.match(visibleText(context), /Nueva solicitud/);
    assert.match(visibleText(context), /A\s+4\s+min/);
    assert.deepEqual(actionLabels(actions), ['Aceptar', 'Rechazar']);
    assert.equal(tree.root.findAllByType('ScrollView' as never).length, 0);
    const pickup = context.find(node => typeof node.props.accessibilityLabel === 'string'
      && node.props.accessibilityLabel.startsWith('Recogida:'));
    assert.match(pickup.props.accessibilityLabel, /accesibilidad completa/);
  } finally { await act(async () => tree.unmount()); h.client.clear(); }
});

test('Offer recovery stays actionable while accept and reject remain fenced by a pending intent', async () => {
  const h = createHarness();
  const { DriverOffer } = h.load('src/features/driver/DriverOffer.tsx');
  const offer = { id: 'offer', requestId: 'request', expiresAt: 20_000, etaMinutes: 4, pickup: place };
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(DriverOffer, { offer, revision: 3, now: 1_000,
    disabled: true, error: 'No pudimos confirmar la acción.', retryAvailable: true, retryDisabled: false,
    onAccept() {}, onReject() {}, onRetry() {}, trace() {} })); });
  try {
    const actions = tree.root.findByProps({ testID: 'driver-offer-critical-actions' });
    const buttons = actions.findAllByType('Pressable' as never);
    assert.deepEqual(buttons.map(button => button.props.accessibilityLabel), ['Reintentar acción', 'Aceptar', 'Rechazar']);
    assert.deepEqual(buttons.map(button => button.props.disabled), [false, true, true]);
    assert.equal(actions.findAll(node => node.props.accessibilityRole === 'alert').length, 1);
  } finally { await act(async () => tree.unmount()); h.client.clear(); }
});

test('light and dark share identical Driver structure and no feature-level theme branch', async () => {
  const signatures: Record<string, unknown> = {};
  for (const themeName of ['light', 'dark'] as const) {
    const { h, tree } = await renderPanel(state('ASSIGNED'), { themeName });
    try {
      signatures[themeName] = {
        surfaces: tree.root.findAll(node => typeof node.props.testID === 'string').map(node => node.props.testID),
        actions: tree.root.findAllByType('Pressable' as never).map(node => node.props.accessibilityLabel),
      };
    } finally { await act(async () => tree.unmount()); h.client.clear(); }
  }
  assert.deepEqual(signatures.dark, signatures.light);
  assert.deepEqual(Object.keys(darkTheme), Object.keys(lightTheme));
  assert.equal(resolveVimaThemeName(true, 'dark'), 'dark');
  const panel = readFileSync('src/features/driver/DriverStatePanel.tsx', 'utf8');
  const offer = readFileSync('src/features/driver/DriverOffer.tsx', 'utf8');
  assert.doesNotMatch(panel + offer, /theme\.name|darkThemeColors|surfaceDark/);
});

test('Driver controller stays functional and presentation contains no debug identity', () => {
  const panel = readFileSync('src/features/driver/DriverStatePanel.tsx', 'utf8');
  const offer = readFileSync('src/features/driver/DriverOffer.tsx', 'utf8');
  const screen = readFileSync('src/dev/driver/DriverLiveScreen.tsx', 'utf8');
  assert.ok(panel.indexOf('testID="driver-secondary-content"') < panel.indexOf('testID="driver-critical-region"'));
  assert.doesNotMatch(panel, /surface:\s*\{[^}]*\bheight:/s);
  assert.equal((screen.match(/<SafeAreaView/g) ?? []).length, 1);
  assert.match(screen, /renderPhase=\{\(\) => offer \?\s*<DriverOffer/);
  assert.match(screen, /error=\{error\} retryAvailable=\{!!pending\.current\} retryDisabled=\{busy\}/);
  assert.doesNotMatch(panel + offer, /<VimaText[^>]*>[^<]*(?:accountId|revision|requestId|operationId)|Driver P0/i);
  assert.doesNotMatch(screen, /assigned\.value\.id|accountId\} ·|Driver P0/);
  assert.doesNotMatch(offer, /destino|distancia|tarifa|ganancia/i);
});

test('Driver uses one Atlacomulco fallback and location pulse is exclusive to LOCATING', () => {
  assert.deepEqual(driverMapFallback, [-99.88795, 19.79021]);
  const screen = readFileSync('src/dev/driver/DriverLiveScreen.tsx', 'utf8');
  assert.match(screen, /const target = location\?\.coordinate \?\? driverMapFallback/);
  assert.match(screen, /active=\{availability === 'LOCATING' && foreground && focused\}/);
  assert.doesNotMatch(screen, /zoom:\s*[0123]\b/);
});
