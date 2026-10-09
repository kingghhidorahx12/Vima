import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { darkTheme } from '../src/design/themes/dark.ts';
import { lightTheme } from '../src/design/themes/light.ts';
import { resolveVimaThemeName } from '../src/design/themes/resolve.ts';
import { createPassengerFixtureGateway } from '../src/dev/passenger/gateway.ts';
import { fixturePlaces } from '../src/dev/passenger/fixtures.ts';
import type { DriverState } from '../src/services/matching/contracts.ts';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
Reflect.set(globalThis, '__DEV__', true);
const clock = { after: () => () => {}, delay: async () => {} };
const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

test('one root provider selects the global DEV theme and Driver cannot override it', () => {
  const root = readFileSync('src/providers/RootProviders.tsx', 'utf8');
  const driver = readFileSync('src/dev/driver/DriverLiveScreen.tsx', 'utf8');
  const map = readFileSync('src/map/VimaMap.tsx', 'utf8');
  assert.equal((root.match(/<VimaThemeProvider\b/g) ?? []).length, 1);
  assert.match(root, /EXPO_PUBLIC_VIMA_THEME/);
  assert.doesNotMatch(root + driver, /EXPO_PUBLIC_VIMA_DRIVER_THEME|resolveDriverTheme|DriverThemeName/);
  assert.doesNotMatch(driver, /VimaThemeProvider|basemapVariant|themeName/);
  assert.match(map, /theme\.roles\.mapVariant/);
  assert.match(map, /EXPO_PUBLIC_MAP_STYLE_DARK_URL/);
  assert.equal(resolveVimaThemeName(true, 'dark'), 'dark');
  assert.equal(resolveVimaThemeName(false, 'dark'), 'light');
});

test('light and dark implement the same closed semantic contract', () => {
  assert.deepEqual(Object.keys(darkTheme).sort(), Object.keys(lightTheme).sort());
  assert.deepEqual(Object.keys(darkTheme.roles).sort(), Object.keys(lightTheme.roles).sort());
  assert.deepEqual(Object.keys(darkTheme.surfaces).sort(), Object.keys(lightTheme.surfaces).sort());
  assert.deepEqual(Object.keys(darkTheme.text).sort(), Object.keys(lightTheme.text).sort());
  assert.equal(lightTheme.roles.background, '#F6F7F8');
  assert.equal(lightTheme.roles.surface, '#FFFFFF');
  assert.equal(darkTheme.roles.background, '#0B0F0E');
  assert.equal(darkTheme.roles.surface, '#121816');
  assert.equal(darkTheme.roles.mapVariant, 'dark');
});

test('Passenger representative states keep geometry while the global theme changes presentation', async () => {
  const summaries: Record<string, unknown> = {};
  for (const themeName of ['light', 'dark'] as const) {
    const fixture = createPassengerFixtureGateway(clock);
    const h = createHarness({}, { themeName });
    const tree: ReactTestRenderer = await h.render(fixture.gateway);
    try {
      await settle();
      const root = tree.root.findByProps({ testID: 'passenger-root' });
      const home = tree.root.findByProps({ testID: 'passenger-home-search' });
      const frame = tree.root.findByProps({ testID: 'passenger-home-search-frame' });
      const panel = tree.root.findByProps({ testID: 'passenger-panel-background' });
      summaries[themeName] = {
        homeHeight: flatten(home.props.style({ pressed: false })).height,
        frameHeight: flatten(frame.props.style).height,
        panelRadii: [flatten(panel.props.style).borderTopLeftRadius, flatten(panel.props.style).borderTopRightRadius],
      };
      assert.equal(flatten(root.props.style).backgroundColor, themeName === 'dark' ? '#0B0F0E' : '#F6F7F8');
      assert.equal(flatten(panel.props.style).backgroundColor, themeName === 'dark' ? '#121816' : '#FFFFFF');
      const search = tree.root.findAllByType('Pressable' as never).find(node => node.props.accessibilityLabel === '¿A dónde vamos?')!;
      await act(async () => search.props.onPress());
      assert.equal(tree.root.findAllByType('TextInput' as never).length, 1);
      await act(async () => h.back()); await settle();
      const stateSignatures: unknown[] = [];
      const signature = (state: string) => stateSignatures.push({ state,
        actions: tree.root.findAllByType('Pressable' as never).map(node => node.props.accessibilityLabel).filter(Boolean),
        addressFrames: tree.root.findAll(node => node.props.testID === 'passenger-address-frame').length,
        sheetRadii: [flatten(tree.root.findByType('SheetBoundary' as never).props.style).borderTopLeftRadius,
          flatten(tree.root.findByType('SheetBoundary' as never).props.style).borderTopRightRadius],
      });
      const press = async (label: string) => {
        const target = tree.root.findAllByType('Pressable' as never).find(node => node.props.accessibilityLabel === label);
        assert.ok(target, `Missing Passenger action: ${label}`);
        await act(async () => target.props.onPress()); await settle();
      };
      const recentLabel = `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`;
      await press(recentLabel);
      assert.equal(tree.root.findAll(node => node.props.testID === 'passenger-address-frame').length, 1);
      signature('reviewing');
      await press('Confirmar ubicaciones'); signature('confirm');
      await press('Solicitar viaje'); signature('matching');
      await act(async () => fixture.controls.advance('assigned')); await settle(); signature('assigned');
      (summaries[themeName] as { states?: unknown[] }).states = stateSignatures;
    } finally {
      await act(async () => tree.unmount()); h.client.clear(); fixture.controls.dispose();
    }
  }
  assert.deepEqual(summaries.dark, summaries.light);
});

test('Driver OFFLINE, LOCATING, AVAILABLE, ASSIGNED and Offer render with identical structure in both themes', async () => {
  const place = { id: 'pickup', name: 'Plaza', address: 'Centro', coordinate: [-99.88, 19.79] as [number, number] };
  const profile = { driver: { name: 'Conductor', rating: 4.9 }, vehicle: { name: 'Auto', plate: 'VIMA', color: 'Blanco' } };
  const state = (availability: DriverState['availability']): DriverState => ({ accountId: 'driver', revision: 1,
    availability, expiryCount: 0, profile, ...(availability === 'AVAILABLE' ? {
      location: { coordinate: place.coordinate, receivedAt: 1 },
    } : {}) });
  const assigned: DriverState = { ...state('ASSIGNED'),
    assignment: { requestId: 'request', pickup: place, state: 'ASSIGNED' as const, lifecycle: { completedStops: 0, incurredAdditionCodes: [] }, stops: [], additionCodes: [], value: { id: 'assignment', driver: profile.driver,
      vehicle: profile.vehicle, etaMinutes: 7, sample: { coordinate: place.coordinate, heading: 0, sequence: 1 },
      routeToOrigin: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [place.coordinate, [-99.87, 19.8]] } } } } };
  const structures: Record<'light' | 'dark', string[]> = { light: [], dark: [] };
  for (const themeName of ['light', 'dark'] as const) {
    const h = createHarness({}, { themeName });
    const { DriverStatePanel } = h.load('src/features/driver/DriverStatePanel.tsx');
    const { DriverOffer } = h.load('src/features/driver/DriverOffer.tsx');
    for (const driverState of [state('OFFLINE'), state('LOCATING'), state('AVAILABLE'), assigned]) {
      let tree!: ReactTestRenderer;
      await act(async () => { tree = create(React.createElement(DriverStatePanel, { state: driverState, connection: 'online', configured: true,
        busy: false, error: '', retryAvailable: false, onAvailable() {}, onOffline() {}, onCancelAssignment() {}, onRetry() {} })); });
      structures[themeName].push(tree.root.findAllByType('Pressable' as never).map(node => node.props.accessibilityLabel).join('|'));
      await act(async () => tree.unmount());
    }
    const offer = { id: 'offer', requestId: 'request', pickup: place, etaMinutes: 4, expiresAt: 10_000 };
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(React.createElement(DriverOffer, { offer, revision: 1, now: 0,
      disabled: false, onAccept() {}, onReject() {}, trace() {} })); });
    structures[themeName].push(tree.root.findAllByType('Pressable' as never).map(node => node.props.accessibilityLabel).join('|'));
    await act(async () => tree.unmount());
  }
  assert.deepEqual(structures.dark, structures.light);
});

test('productive surfaces consume semantic roles without a feature-specific dark branch', () => {
  const files = ['src/design/components/VimaButton.tsx', 'src/features/driver/DriverStatePanel.tsx',
    'src/features/passenger/PassengerScreen.tsx', 'src/features/passenger/MapControls.tsx',
    'src/features/passenger/PassengerBottomNavigation.tsx', 'src/dev/LiveAccountGate.tsx'];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /theme\.name\s*===|darkThemeColors|surfaceDark|secondaryDark/);
  }
  assert.doesNotMatch(readFileSync('src/design/primitives/index.tsx', 'utf8'), /semanticColors\.textPrimary/);
});
