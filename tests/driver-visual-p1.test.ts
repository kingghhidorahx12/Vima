import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { DriverState } from '../src/services/matching/contracts.ts';
const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const state: DriverState = { accountId: 'test', revision: 1, availability: 'OFFLINE', expiryCount: 0,
  profile: { driver: { name: 'Nombre real del perfil', rating: 4.8 }, vehicle: { name: 'Vehículo del perfil', plate: 'TEST-123', color: 'Blanco' } } };
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType('Text' as never).map(n => n.props.children).flat().join('');
const button = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label)!;

test('Driver account uses authorized profile and actual appearance controls, with equal geometry in both themes', async () => {
  let signature: string[] | undefined;
  for (const themeName of ['light', 'dark']) {
    const h = createHarness({}, { themeName, reduced: true }); const { DriverAccountPanel } = h.load('src/features/driver/DriverAccountPanel.tsx');
    let closed = 0; let tree!: ReactTestRenderer;
    await act(async () => { tree = create(React.createElement(DriverAccountPanel, { state, onClose: () => closed++ })); });
    try {
      assert.ok(texts(tree).includes(state.profile.driver.name)); assert.ok(texts(tree).includes(state.profile.vehicle.plate));
      assert.equal(/Ganancias|Documentos|Historial|conductor activo|\+52/i.test(texts(tree)), false);
      assert.equal(tree.root.findAllByType('TextInput' as never).length, 0);
      assert.equal(typeof button(tree, themeName === 'light' ? 'Usar tema oscuro' : 'Usar tema claro').props.onPress, 'function');
      const structure = tree.root.findAll(n => typeof n.type === 'string').map(n => String(n.type));
      if (signature) assert.deepEqual(structure, signature); else signature = structure;
      await act(async () => button(tree, 'Volver a la operación').props.onPress()); assert.equal(closed, 1);
    } finally { await act(async () => tree.unmount()); h.client.clear(); }
  }
});

test('compact account entry stays separate from critical actions and sends no availability command', async () => {
  const h = createHarness(); const { DriverMapPanel } = h.load('src/features/driver/DriverMapPanel.tsx');
  let accounts = 0; let available = 0; let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(DriverMapPanel, { state, connection: 'online', configured: true, busy: false,
    error: 'Error recuperable', retryAvailable: false, onAccount: () => accounts++, onAvailable: () => available++, onOffline() {},
    onCancelAssignment() {}, onRetry() {}, onMinimumHeight() {} })); });
  try {
    const critical = tree.root.findByProps({ testID: 'driver-critical-region' });
    assert.equal(critical.findAllByType('ScrollView' as never).length, 0);
    assert.ok(critical.findAllByProps({ accessibilityLabel: 'Conectarme' }).length);
    await act(async () => button(tree, 'Mi cuenta y ajustes').props.onPress()); assert.equal(accounts, 1); assert.equal(available, 0);
    await act(async () => button(tree, 'Conectarme').props.onPress()); assert.equal(available, 1);
  } finally { await act(async () => tree.unmount()); h.client.clear(); }
});

test('account is an optional surface beside the persistent shell and closes before an incoming operational phase', () => {
  const source = readFileSync('src/features/driver/DriverOperationalSurface.tsx', 'utf8');
  assert.equal((source.match(/<DriverRideShell/g) ?? []).length, 1);
  assert.match(source, /accountFrame.phase === phase && accountFrame.open/);
  assert.match(source, /if \(accountFrame.phase !== phase\) setAccountFrame\(\{ phase, open: false \}\)/);
  assert.match(source, /accountOpen && data/);
  assert.doesNotMatch(source, /key=\{accountOpen|if \(accountOpen\) return/);
  const panel = readFileSync('src/features/driver/DriverMapPanel.tsx', 'utf8');
  assert.doesNotMatch(panel.slice(panel.indexOf('driver-operational-panel')), /onPress=\{props.onAccount\}/);
});
