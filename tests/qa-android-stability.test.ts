import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../src/services/api/client.ts';
import { RequestTimeoutError, withDeadline } from '../src/services/api/deadline.ts';
import { accountValidationMessage } from '../src/dev/accountValidation.ts';
import { lifecycleCommandMessage } from '../src/dev/driver/lifecycleFeedback.ts';
import { createThemeControl } from '../src/design/themes/control.ts';

const require = createRequire(import.meta.url);
const { QueryClientProvider } = require('@tanstack/react-query');
const { createMapHarness } = require('./support/map-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const deferred = <T,>() => {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('deadline releases stalled storage; theme fallback never overwrites preferences or adopts a late read', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const read = deferred<never>(); let writes = 0;
  const control = createThemeControl({ readPreferences: () => read.promise, writePreferences: async () => { writes++; } }, 'dark');
  const loading = control.load(); assert.equal(control.load(), loading);
  t.mock.timers.tick(8000); await loading;
  assert.deepEqual(control.getSnapshot(), { ready: true, name: 'dark', reducedMotion: 'reduce' });
  read.resolve({ version: 1, themeName: 'light', reducedMotion: 'system' } as never);
  await Promise.resolve(); assert.equal(control.getSnapshot().name, 'dark'); assert.equal(writes, 0);
  const controller = new AbortController(); let timedOut = 0;
  const bounded = withDeadline(new Promise<never>(() => {}), 12_000, controller.signal, () => { timedOut++; controller.abort(); });
  const rejection = assert.rejects(bounded, RequestTimeoutError);
  t.mock.timers.tick(12_000); await rejection; assert.equal(timedOut, 1);
});

test('Root shows progress/error/retry without fonts and hides native splash after visible layout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let hidden = 0; let fontRetries = 0;
  const client = new QueryClient();
  const h = createMapHarness({ realTheme: true, fileOverrides: {
    'src/design/fonts.ts': { appFonts: {} },
    'src/services/api/queryClient.ts': { createQueryClient: () => client },
    'src/services/storage/local.ts': { localStorage: { readPreferences: async () => null, writePreferences: async () => {} } },
  }, externalOverrides: {
    'expo-font': { useFonts: () => [false, null], loadAsync: async () => { fontRetries++; } },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-splash-screen': { hideAsync: async () => { hidden++; } },
    'react-native-gesture-handler': { GestureHandlerRootView: 'GestureRoot' },
  } });
  const { RootProviders } = h.load('src/providers/RootProviders.tsx');
  const tree: ReactTestRenderer = await h.render(React.createElement(RootProviders, null, React.createElement('Product')));
  try {
    assert.equal(tree.root.findAllByType('Product' as never).length, 0);
    assert.ok(tree.root.findByProps({ testID: 'app-startup-progress' }));
    await h.act(async () => tree.root.findByType('GestureRoot' as never).props.onLayout());
    assert.equal(hidden, 1);
    await h.act(async () => t.mock.timers.tick(10_000));
    await h.act(async () => tree.root.findByProps({ accessibilityLabel: 'Reintentar inicio' }).props.onPress());
    assert.equal(fontRetries, 1); assert.equal(tree.root.findAllByType('Product' as never).length, 1);
  } finally { await h.act(async () => tree.unmount()); client.clear(); }
});

test('account errors distinguish invalid credential, access, connectivity and timeout without leaking details', () => {
  assert.match(accountValidationMessage(new ApiError(401)), /credencial no es válida/);
  assert.match(accountValidationMessage(new ApiError(403)), /no tiene acceso/);
  assert.match(accountValidationMessage(new ApiError(503)), /servicio/);
  assert.match(accountValidationMessage(new TypeError('secret upstream URL')), /conexión/);
  assert.match(accountValidationMessage(new RequestTimeoutError()), /tardó demasiado/);
  assert.doesNotMatch(accountValidationMessage(new Error('private token')), /private token/);
});

test('real gate aborts old role validation, ignores late receipt, single-flights retries and preserves credentials', async () => {
  const oldURL = process.env.EXPO_PUBLIC_VIMA_API_BASE_URL;
  process.env.EXPO_PUBLIC_VIMA_API_BASE_URL = 'https://qa.example.test';
  const requests: { signal: AbortSignal; result: ReturnType<typeof deferred<unknown>> }[] = [];
  let reads = 0; let writes = 0; let clears = 0;
  let savedCredential = 'synthetic-token'; const focusCallbacks = new Set<() => (() => void) | void>();
  const h = createMapHarness({ fileOverrides: {
    'src/services/storage/credentials.ts': { credentials: {
      read: async () => { reads++; return savedCredential; }, write: async () => { writes++; }, clear: async () => { clears++; },
    } },
    'src/services/matching/client.ts': { createMatchingClient: () => ({ identity: (signal: AbortSignal) => {
      const result = deferred<unknown>(); requests.push({ signal, result }); return result.promise;
    } }) },
  }, externalOverrides: {
    'expo-router': { useFocusEffect: (cb: () => (() => void) | void) => React.useEffect(() => {
      focusCallbacks.add(cb); const cleanup = cb(); return () => { focusCallbacks.delete(cb); cleanup?.(); };
    }, [cb]), Link: 'Link' },
    'expo-dev-client': { registerDevMenuItems: async () => {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  } });
  const { LiveAccountGate } = h.load('src/dev/LiveAccountGate.tsx');
  const client = new QueryClient();
  // eslint-disable-next-line react/no-children-prop -- Render-function contract, not a ReactNode child.
  const element = (role: string) => React.createElement(QueryClientProvider, { client }, React.createElement(LiveAccountGate,
    { role, children: (session: { identity: { accountId: string } }) => React.createElement('Session', { accountId: session.identity.accountId }) }));
  const tree: ReactTestRenderer = await h.render(element('passenger'));
  try {
    assert.equal(reads, 1); assert.equal(requests.length, 1);
    await h.act(async () => tree.update(element('driver')));
    assert.equal(requests[0]!.signal.aborted, true); assert.equal(requests.length, 2);
    await h.act(async () => requests[0]!.result.resolve({ accountId: 'old', role: 'passenger' }));
    assert.equal(tree.root.findAllByType('Session' as never).length, 0);
    await h.act(async () => requests[1]!.result.reject(new TypeError('offline')));
    await h.act(async () => tree.root.findByType('TextInput' as never).props.onChangeText('synthetic-invalid-token'));
    const save = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Guardar y conectar')!;
    await h.act(async () => save.props.onPress());
    const GateApiError = h.load('src/services/api/client.ts').ApiError;
    await h.act(async () => requests[2]!.result.reject(new GateApiError(401)));
    assert.equal(writes, 0); assert.equal(clears, 0); assert.equal(reads, 2);
    const retry = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Reintentar cuenta guardada')!;
    await h.act(async () => { retry.props.onPress(); retry.props.onPress(); });
    assert.equal(requests.length, 4); assert.equal(reads, 3);
    await h.act(async () => requests[3]!.result.resolve({ accountId: 'driver', role: 'driver', matchingAvailable: true }));
    assert.equal(tree.root.findByType('Session' as never).props.accountId, 'driver');
    assert.equal(writes, 0); assert.equal(clears, 0);
    await h.act(async () => { for (const cb of focusCallbacks) cb(); });
    assert.equal(requests.length, 4, 'same validated credential reuses its session on refocus');
    savedCredential = 'synthetic-other-role';
    await h.act(async () => { for (const cb of focusCallbacks) cb(); });
    assert.equal(tree.root.findAllByType('Session' as never).length, 0, 'old principal cannot remain visible after another mode changes credential');
    await h.act(async () => requests[4]!.result.resolve({ accountId: 'other', role: 'passenger', matchingAvailable: true }));
    assert.equal(tree.root.findAllByType('Session' as never).length, 0);
    assert.equal(writes, 0); assert.equal(clears, 0);
  } finally {
    await h.act(async () => tree.unmount()); client.clear();
    if (oldURL === undefined) delete process.env.EXPO_PUBLIC_VIMA_API_BASE_URL; else process.env.EXPO_PUBLIC_VIMA_API_BASE_URL = oldURL;
  }
});

test('transparent controls footprint passes hits; visible menu and controls retain interaction', async () => {
  const h = createMapHarness(); const { MapControls } = h.load('src/features/passenger/MapControls.tsx');
  const element = (open: boolean) => React.createElement(MapControls, { available: true, layers: { traffic: true, incidents: true },
    open, onOpen() {}, onToggle() {} });
  const tree: ReactTestRenderer = await h.render(element(false));
  try {
    assert.equal(tree.root.findAllByProps({ testID: 'map-controls-hit-area' }).at(-1)!.props.pointerEvents, 'box-none');
    assert.equal(tree.root.findByProps({ testID: 'passenger-layers-slot' }).props.pointerEvents, 'box-none');
    assert.equal(tree.root.findByProps({ testID: 'passenger-layers-menu' }).props.pointerEvents, 'none');
    await h.act(async () => tree.update(element(true)));
    assert.equal(tree.root.findByProps({ testID: 'passenger-layers-menu' }).props.pointerEvents, 'auto');
    assert.equal(tree.root.findAllByType('Pressable' as never).filter(n => n.props.accessibilityRole === 'switch').length, 2);
  } finally { await h.act(async () => tree.unmount()); }
});

test('Driver native initial camera is local and latest target applies only after map ready without remount', async () => {
  const h = createMapHarness(); const { Camera } = h.load('src/map/Camera.tsx');
  const initial = { center: [-99.88, 19.79], zoom: 14 };
  const current = { center: [-99.9, 19.8], zoom: 14 };
  const element = (ready: boolean, target = initial) => React.createElement(Camera, { initialTarget: initial, target, ready });
  const tree: ReactTestRenderer = await h.render(element(false));
  try {
    assert.deepEqual(tree.root.findByType('MapLibreCamera' as never).props.initialViewState.center, initial.center);
    assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'setStop').length, 0);
    await h.act(async () => tree.update(element(false, current)));
    await h.act(async () => tree.update(element(true, current)));
    const stops = h.calls.filter((c: unknown[]) => c[0] === 'setStop');
    assert.equal(stops.length, 1); assert.deepEqual(stops[0][1].center, current.center); assert.equal(stops[0][1].duration, 0);
    assert.equal(h.calls.filter((c: unknown[]) => c[0] === 'mount' && c[1] === 'MapLibreCamera').length, 1);
    assert.match(readFileSync('src/features/driver/useDriverMap.tsx', 'utf8'), /initialTarget=\{target\} ready=\{ready\}/);
  } finally { await h.act(async () => tree.unmount()); }
});

test('launch can release stalled map without remount and never covers a later scene again', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = createMapHarness(); const { VimaLaunchSurface } = h.load('src/motion/VimaLaunchSurface.tsx');
  const tree: ReactTestRenderer = await h.render(React.createElement(VimaLaunchSurface, { ready: false }));
  try {
    await h.act(async () => t.mock.timers.tick(10_000));
    await h.act(async () => tree.root.findByProps({ accessibilityLabel: 'Continuar mientras carga' }).props.onPress());
    assert.equal(tree.root.findByProps({ testID: 'vima-launch-surface' }).props.pointerEvents, 'none');
    await h.act(async () => tree.update(React.createElement(VimaLaunchSurface, { ready: false, active: false })));
    assert.equal(tree.root.findByProps({ testID: 'vima-launch-surface' }).props.pointerEvents, 'none');
  } finally { await h.act(async () => tree.unmount()); }
});

test('IN_PROGRESS feedback distinguishes missing sample from distance zero; no success inferred', () => {
  assert.match(lifecycleCommandMessage(new Error('journal_telemetry_pending')), /muestra GPS/);
  assert.match(lifecycleCommandMessage(new Error('journal_telemetry_pending')), /no es necesario desplazarte/);
  assert.match(lifecycleCommandMessage(new Error('command_already_queued')), /mismo intento/);
  assert.equal(lifecycleCommandMessage(new ApiError(409, 'incorrect_pin')), 'PIN incorrecto.');
  assert.match(lifecycleCommandMessage(new Error('unknown')), /sin confirmar/);
});
