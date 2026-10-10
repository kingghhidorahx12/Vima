import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import { QueryClient } from '@tanstack/react-query';
import { createDriverCameraIntents, driverMapContent } from '../src/features/driver/driverMapModel.ts';
import { mapLayerCapabilities } from '../src/map/traffic.ts';
import { createThemeControl } from '../src/design/themes/control.ts';
import type { LocalPreferences } from '../src/services/storage/contracts.ts';
import type { DriverState } from '../src/services/matching/contracts.ts';

const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const pickup = { id: 'pickup', name: 'Plaza', address: 'Centro', coordinate: [-99.88, 19.79] as [number, number] };
const profile = { driver: { name: 'Conductor', rating: 4.9 }, vehicle: { name: 'Auto', plate: 'VIMA', color: 'Blanco' } };
function snapshot(phase: string, revision = 1, location = true): DriverState {
  return { accountId: 'driver', revision, availability: ['OFFLINE', 'LOCATING', 'AVAILABLE', 'PAUSED'].includes(phase)
    ? phase as DriverState['availability'] : phase === 'OFFER' ? 'AVAILABLE' : 'ASSIGNED', expiryCount: 0, profile,
    ...(location ? { location: { coordinate: [-99.89 + revision / 10000, 19.8], receivedAt: Date.now() } } : {}),
    ...(phase === 'OFFER' ? { offer: { id: 'offer', requestId: 'request', expiresAt: 10000, etaMinutes: 7, pickup } } : {}),
    ...(['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS', 'PAYMENT_PENDING', 'COMPLETED'].includes(phase) ? {
      assignment: { requestId: 'request', pickup, state: phase as NonNullable<DriverState['assignment']>['state'],
        lifecycle: { completedStops: 0, incurredAdditionCodes: [] }, stops: [], additionCodes: [],
        value: { id: 'assignment', ...profile, etaMinutes: 7, sample: { coordinate: pickup.coordinate, heading: 0, sequence: 1 },
          routeToOrigin: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[-99.89, 19.8], pickup.coordinate] } } } },
    } : {}) };
}

test('Driver map visibility is exclusively authoritative by lifecycle state', () => {
  for (const phase of ['OFFLINE', 'LOCATING', 'AVAILABLE', 'PAUSED', 'OFFER', 'ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS', 'PAYMENT_PENDING', 'COMPLETED']) {
    const state = snapshot(phase); const content = driverMapContent(state);
    assert.equal(content.location, state.location);
    assert.equal(!!content.pickup, ['OFFER', 'ASSIGNED', 'ARRIVED_PICKUP'].includes(phase), phase);
    assert.equal(!!content.route, phase === 'ASSIGNED', phase);
    assert.equal(driverMapContent(snapshot(phase, 1, false)).location, undefined);
  }
});

test('camera emits only acquisition and phase-entry intents; GPS/ticks/revisions retain object identity', () => {
  const camera = createDriverCameraIntents(); const fallback = camera(snapshot('OFFLINE', 1, false));
  assert.deepEqual(fallback.center, [-99.88795, 19.79021]);
  const acquired = camera(snapshot('AVAILABLE')); assert.notEqual(acquired, fallback);
  assert.equal(camera(snapshot('AVAILABLE', 2)), acquired);
  const offer = camera(snapshot('OFFER', 3)); assert.notEqual(offer, acquired);
  assert.equal(offer.coordinates?.length, 2); assert.equal(camera(snapshot('OFFER', 4)), offer);
  const assigned = camera(snapshot('ASSIGNED', 5)); assert.notEqual(assigned, offer);
  assert.equal(assigned.coordinates?.length, 4); assert.equal(camera(snapshot('ASSIGNED', 6)), assigned);
  assert.equal(camera(snapshot('ARRIVED_PICKUP', 7)), assigned);
  const progress = camera(snapshot('IN_PROGRESS', 8)); assert.notEqual(progress, assigned);
  assert.equal(camera(snapshot('IN_PROGRESS', 9)), progress);
  assert.equal(camera(snapshot('PAYMENT_PENDING', 10)), progress);
  assert.equal(camera(snapshot('COMPLETED', 11)), progress);
});

test('theme authority, invalid values and read failure resolve without a bootstrap flash', async () => {
  const cases = [ ['dark', 'light', 'dark'], ['light', 'dark', 'light'], [undefined, 'dark', 'dark'],
    [undefined, undefined, 'light'], ['invalid', 'dark', 'dark'], [undefined, 'DARK', 'light'] ];
  for (const [stored, env, expected] of cases) {
    const control = createThemeControl({ readPreferences: async () => ({ version: 1, reducedMotion: 'system', themeName: stored } as LocalPreferences), writePreferences: async () => {} }, env);
    assert.equal(control.getSnapshot().ready, false); await control.load();
    assert.equal(control.getSnapshot().name, expected); assert.equal(control.getSnapshot().ready, true);
  }
  for (const env of ['dark', undefined]) {
    const control = createThemeControl({ readPreferences: async () => { throw Error('storage'); }, writePreferences: async () => {} }, env);
    await control.load(); assert.equal(control.getSnapshot().name, env ?? 'light');
  }
});

test('rapid theme intentions are immediate, serialize writes, preserve reducedMotion and restart at last intention', async () => {
  const releases: (() => void)[] = []; const writes: LocalPreferences[] = [];
  let stored: LocalPreferences = { version: 1, reducedMotion: 'reduce', themeName: 'light' };
  const storage = { readPreferences: async () => stored, writePreferences: (p: LocalPreferences) => new Promise<void>(resolve => {
    writes.push(p); releases.push(() => { stored = p; resolve(); });
  }) };
  const control = createThemeControl(storage, 'dark'); await control.load();
  control.setTheme('dark'); control.setTheme('light'); assert.equal(control.getSnapshot().name, 'light');
  await new Promise<void>(resolve => queueMicrotask(resolve)); assert.equal(writes.length, 1);
  releases[0]!(); await new Promise(resolve => setImmediate(resolve)); assert.equal(writes.length, 2);
  releases[1]!(); await control.flushed();
  assert.deepEqual(writes.map(p => p.themeName), ['dark', 'light']); assert.equal(stored.reducedMotion, 'reduce');
  const restarted = createThemeControl(storage, 'dark'); await restarted.load(); assert.equal(restarted.getSnapshot().name, 'light');
});

function integratedHarness(reduced = false, preferences?: Promise<LocalPreferences | null>, fonts = { ready: true }) {
  const counters = { sheets: 0, sheetUnmounts: 0, scenes: 0, sceneUnmounts: 0 };
  function Sheet({ children }: { children: React.ReactNode }) {
    React.useEffect(() => { counters.sheets++; return () => { counters.sheetUnmounts++; }; }, []);
    return React.createElement('SheetBoundary', null, children);
  }
  const h = createMapHarness({ realTheme: true, realMotion: true, reduced, fileOverrides: {
    'src/design/fonts.ts': { appFonts: {} },
    'src/services/api/queryClient.ts': { createQueryClient: () => new QueryClient() },
    'src/services/storage/local.ts': { localStorage: { readPreferences: () => preferences ?? Promise.resolve({ version: 1, reducedMotion: 'system', themeName: 'light' }), writePreferences: async () => {} } },
    'src/services/storage/mapLayers.ts': { mapLayerStorage: { read: async () => ({ traffic: true, incidents: true }), write: async () => {} } },
    'src/design/components/VimaRideSheet.tsx': { VimaRideSheet: Sheet },
  }, externalOverrides: { 'expo-font': { useFonts: () => [fonts.ready, null] }, 'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-splash-screen': { hideAsync: async () => {} },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureRoot' } } });
  const { RootProviders } = h.load('src/providers/RootProviders.tsx');
  const { useDriverMap } = h.load('src/features/driver/useDriverMap.tsx');
  const { DriverRideShell } = h.load('src/features/driver/DriverRideShell.tsx');
  function Scene({ state }: { state: DriverState }) {
    React.useEffect(() => { counters.scenes++; return () => { counters.sceneUnmounts++; }; }, []);
    return React.createElement(DriverRideShell, { ...useDriverMap(state, true), renderPhase: () => React.createElement('DriverPanel') });
  }
  const element = (state: DriverState) => React.createElement(RootProviders, null, React.createElement(Scene, { state }));
  return { ...h, counters, element };
}

test('real RootProviders gates bootstrap; runtime theme/OFFER→ASSIGNED reuse map, shell and scene', async () => {
  let release!: (p: LocalPreferences) => void;
  const prefs = new Promise<LocalPreferences>(resolve => { release = resolve; });
  const h = integratedHarness(false, prefs); const tree: ReactTestRenderer = await h.render(h.element(snapshot('OFFER')));
  try {
    assert.equal(h.counters.scenes, 0); assert.ok(tree.root.findByProps({ testID: 'app-startup-progress' }));
    await h.act(async () => release({ version: 1, reducedMotion: 'system', themeName: 'dark' }));
    assert.equal(tree.root.findByType('StatusBar' as never).props.style, 'light');
    const map = tree.root.findByType('MapLibreMap' as never); const darkStyle = map.props.mapStyle;
    const controls = () => tree.root.findAllByType('Pressable' as never);
    const toggle = controls().find(n => n.props.accessibilityLabel === 'Cambiar a modo claro')!;
    assert.equal(toggle.props.style({ pressed: false })[0].width, 40);
    await h.act(async () => toggle.props.onPress());
    assert.equal(tree.root.findByType('StatusBar' as never).props.style, 'dark');
    assert.notDeepEqual(tree.root.findByType('MapLibreMap' as never).props.mapStyle, darkStyle);
    assert.equal(tree.root.findByProps({ id: 'driver-vehicle' }).props.layout['icon-image'], 'vima-driver-light');
    await h.act(async () => tree.update(h.element(snapshot('ASSIGNED', 2))));
    assert.ok(tree.root.findByProps({ id: 'driver-pickup-route' }));
    await h.act(async () => tree.update(h.element(snapshot('ARRIVED_PICKUP', 3))));
    assert.equal(tree.root.findAllByProps({ id: 'driver-pickup-route' }).length, 0);
    assert.deepEqual(h.counters, { sheets: 1, sheetUnmounts: 0, scenes: 1, sceneUnmounts: 0 });
    assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'mount' && c[1] === 'MapLibreMap').length, 1);
    assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'unmount' && c[1] === 'MapLibreMap').length, 0);
    const overlays = tree.root.findAllByType('View' as never).filter(n => n.props.pointerEvents === 'box-none' && n.props.style?.position === 'absolute');
    assert.ok(overlays.length > 0);
  } finally { await h.act(async () => tree.unmount()); }
});

test('fonts gate productive UI independently; native Driver layers follow phases without invented fallback geometry', async () => {
  const fonts = { ready: false }; const h = integratedHarness(false, undefined, fonts);
  const tree: ReactTestRenderer = await h.render(h.element(snapshot('OFFLINE', 1, false)));
  try {
    assert.equal(h.counters.scenes, 0); fonts.ready = true;
    await h.act(async () => tree.update(h.element(snapshot('OFFLINE', 1, false)))); await h.flush();
    const source = () => tree.root.findAllByType('MapLibreSource' as never).find(n => n.props.id === 'driver-vehicle-source')!;
    assert.deepEqual(JSON.parse(source().props.data).features, []);
    assert.equal(tree.root.findAllByType('MapLibreLayer' as never).filter(n => n.props.id === 'driver-vehicle-acquisition').length, 1);
    for (const phase of ['AVAILABLE', 'OFFER', 'ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS', 'PAYMENT_PENDING']) {
      const s = snapshot(phase, 2);
      await h.act(async () => tree.update(h.element(s))); await h.flush();
      await h.act(async () => tree.update(h.element({ ...s })));
      const data = JSON.parse(source().props.data);
      assert.deepEqual(data.geometry.coordinates, s.location!.coordinate); assert.equal(data.properties.heading, null);
      assert.equal(typeof data.properties.acquisition, 'number');
      const vehicleLayers = tree.root.findAllByType('MapLibreLayer' as never).filter(n => n.props.id.startsWith('driver-vehicle'));
      assert.ok(vehicleLayers.every(n => n.props.animatedProps === undefined));
      const acquisition = vehicleLayers.find(n => n.props.id === 'driver-vehicle-acquisition')!;
      assert.deepEqual(acquisition.props.paint['circle-radius'], ['interpolate', ['linear'], ['get', 'acquisition'], 0, 28, 1, 36]);
      assert.deepEqual(acquisition.props.paint['circle-opacity'], ['interpolate', ['linear'], ['get', 'acquisition'], 0, 0.18, 1, 0]);
      assert.equal(vehicleLayers.find(n => n.props.id === 'driver-vehicle-unoriented')!.props.layout['icon-rotate'], undefined);
      const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
      assert.deepEqual(validateStyleMin({ version: 8, sources: { vehicle: { type: 'geojson', data } },
        layers: vehicleLayers.map(n => ({ id: n.props.id, type: n.props.type, source: 'vehicle',
          ...(n.props.paint ? { paint: n.props.paint } : {}), ...(n.props.layout ? { layout: n.props.layout } : {}),
          ...(n.props.filter ? { filter: n.props.filter } : {}) })) }), []);
      assert.equal(tree.root.findAllByType('MapLibreMarker' as never).some(n => n.props.id === 'driver-pickup'), ['OFFER', 'ASSIGNED', 'ARRIVED_PICKUP'].includes(phase));
      assert.equal(tree.root.findAllByType('MapLibreLayer' as never).some(n => n.props.id === 'driver-pickup-route'), phase === 'ASSIGNED');
      const layerIds = tree.root.findAllByType('MapLibreLayer' as never).map(n => n.props.id);
      if (phase === 'ASSIGNED') assert.ok(layerIds.indexOf('driver-vehicle') > layerIds.indexOf('driver-pickup-route'));
    }
    assert.equal(h.counters.sheets, 1); assert.equal(h.counters.sheetUnmounts, 0);
  } finally { await h.act(async () => tree.unmount()); }
});

test('capabilities disable individual switches and the whole menu only when neither exists', async () => {
  for (const traffic of [false, true]) for (const incidents of [false, true]) {
    const capabilities = mapLayerCapabilities('configured', { flow: traffic ? 'flow' : undefined, incidents: incidents ? 'incidents' : undefined });
    assert.deepEqual(capabilities, { traffic, incidents });
    const h = createMapHarness(); const { MapControls } = h.load('src/features/passenger/MapControls.tsx');
    const tree: ReactTestRenderer = await h.render(React.createElement(MapControls, { available: true, capabilities,
      layers: { traffic: true, incidents: true }, open: true, onOpen() {}, onToggle() {} }));
    try {
      const buttons = tree.root.findAllByType('Pressable' as never);
      for (const [label, enabled] of [['Tráfico', traffic], ['Incidentes', incidents]] as const) {
        const row = buttons.find(n => n.props.accessibilityLabel === label)!;
        assert.equal(row.props.disabled, !enabled); assert.equal(row.props.accessibilityState.checked, enabled);
      }
      assert.equal(buttons.find(n => n.props.accessibilityLabel === 'Capas del mapa')!.props.disabled, !traffic && !incidents);
      if (!traffic && !incidents) assert.equal(tree.root.findByProps({ testID: 'passenger-layers-menu' }).props.pointerEvents, 'none');
    } finally { await h.act(async () => tree.unmount()); }
  }
  assert.deepEqual(mapLayerCapabilities(undefined), { traffic: false, incidents: false });
});

test('Reduced Motion toggle crossfades without rotation; vehicle halo contains no loop', async () => {
  const h = integratedHarness(true); const tree: ReactTestRenderer = await h.render(h.element(snapshot('AVAILABLE')));
  try {
    await h.flush();
    await h.act(async () => tree.update(h.element(snapshot('AVAILABLE'))));
    const source = tree.root.findAllByType('MapLibreSource' as never).find(n => n.props.id === 'driver-vehicle-source')!;
    assert.equal(JSON.parse(source.props.data).properties.acquisition, 1);
    const toggle = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Cambiar a modo oscuro')!;
    const iconStyles = () => toggle.findAllByType('View' as never).map(n => Object.assign({}, ...[n.props.style].flat().filter(Boolean))).filter(s => s.transform?.[0]?.rotate !== undefined);
    assert.ok(iconStyles().length >= 2); assert.ok(iconStyles().every(s => s.transform[0].rotate === '0deg'));
    await h.act(async () => toggle.props.onPress());
    assert.ok(h.calls.some((c: unknown[]) => c[0] === 'timing')); assert.equal(h.calls.some((c: unknown[]) => c[0] === 'repeat'), false);
  } finally { await h.act(async () => tree.unmount()); }
  const marker = readFileSync('src/map/DriverVehicleMarker.tsx', 'utf8');
  assert.doesNotMatch(marker, /withRepeat|setInterval|PassengerUserLocation|AnimatedLayer|createAnimatedComponent\(Layer\)/);
  assert.equal((marker.match(/createAnimatedComponent\(/g) ?? []).length, 1);
});
