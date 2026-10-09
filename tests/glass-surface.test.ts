import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import renderer from 'react-test-renderer';
import { darkTheme } from '../src/design/themes/dark.ts';
import { lightTheme } from '../src/design/themes/light.ts';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('Vima Glass themes share geometry-free tokens with translucent cold-light and carbon-dark bases', () => {
  assert.deepEqual(Object.keys(lightTheme.glass).sort(), Object.keys(darkTheme.glass).sort());
  assert.match(lightTheme.glass.base, /^rgba\(229, 235, 238, 0\.66\)$/);
  assert.match(darkTheme.glass.base, /^rgba\(18, 24, 22, 0\.72\)$/);
  assert.notEqual(lightTheme.glass.base, '#FFFFFF');
  assert.equal(lightTheme.glass.tint, 'light');
  assert.equal(darkTheme.glass.tint, 'dark');
  for (const glass of [lightTheme.glass, darkTheme.glass]) {
    assert.equal('width' in glass || 'height' in glass || 'borderRadius' in glass || 'padding' in glass, false);
  }
});

test('glass primitive inherits caller geometry, preserves children and uses safe Android fallback without a target', async () => {
  for (const themeName of ['light', 'dark'] as const) {
    const h = createHarness({}, { themeName });
    const { VimaGlassSurface } = h.load('src/design/components/VimaGlassSurface.tsx');
    let tree!: renderer.ReactTestRenderer;
    await h.act(async () => { tree = renderer.create(React.createElement(VimaGlassSurface,
      { style: { width: 44, height: 44, borderRadius: 22 } }, React.createElement('Text', null, 'child'))); });
    try {
      const glass = tree.root.findByProps({ testID: 'vima-glass-surface' });
      const geometry = flatten(glass.props.style);
      assert.deepEqual([geometry.width, geometry.height, geometry.borderRadius], [44, 44, 22]);
      assert.equal(glass.props.pointerEvents, 'box-none');
      assert.equal(tree.root.findByType('Text' as never).props.children, 'child');
      assert.equal(tree.root.findAllByType('BlurView' as never).length, 0);
      const tint = tree.root.findByProps({ testID: 'vima-glass-tint' });
      assert.equal(flatten(tint.props.style).backgroundColor,
        themeName === 'light' ? lightTheme.glass.base : darkTheme.glass.base);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('one supplied target enables SDK 57 native blur and preserves the target reference', async () => {
  const h = createHarness();
  const { VimaGlassSurface, VimaGlassTargetProvider } = h.load('src/design/components/VimaGlassSurface.tsx');
  const target = { current: null };
  let tree!: renderer.ReactTestRenderer;
  await h.act(async () => { tree = renderer.create(React.createElement(VimaGlassTargetProvider, { target },
    React.createElement(VimaGlassSurface, { style: { width: 52, height: 52, borderRadius: 26 } }))); });
  try {
    const blur = tree.root.findByType('BlurView' as never);
    assert.equal(blur.props.blurTarget, target);
    assert.equal(blur.props.blurMethod, 'dimezisBlurViewSdk31Plus');
    assert.equal(blur.props.tint, 'light');
    assert.equal(blur.props.intensity, 46);
  } finally { await h.act(async () => tree.unmount()); }
});

test('glass is scoped to floating chrome and inputs while critical/main surfaces remain solid', () => {
  const targets = ['src/features/passenger/PassengerScreen.tsx', 'src/features/passenger/MapControls.tsx',
    'src/features/passenger/MapCompass.tsx', 'src/features/passenger/IncidentCard.tsx',
    'src/design/components/VimaThemeToggle.tsx', 'src/dev/LiveAccountGate.tsx'];
  for (const file of targets) assert.match(readFileSync(file, 'utf8'), /VimaGlassSurface/);
  for (const file of ['src/design/components/VimaRideSheet.tsx', 'src/design/components/VimaButton.tsx',
    'src/features/passenger/PassengerBottomNavigation.tsx', 'src/features/driver/DriverOffer.tsx',
    'src/features/driver/DriverStatePanel.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /VimaGlassSurface|BlurView/);
  }
  const shell = readFileSync('src/features/trip/RideShell.tsx', 'utf8');
  assert.equal((shell.match(/<BlurTargetView\b/g) ?? []).length, 1);
  assert.equal((shell.match(/<VimaGlassTargetProvider\b/g) ?? []).length, 1);
  assert.match(shell, /<MapViewportClip style={mapViewportStyle}><VimaMap/);
  const gate = readFileSync('src/dev/LiveAccountGate.tsx', 'utf8');
  assert.match(gate, /Cuenta DEV/);
  assert.doesNotMatch(gate, /Iniciar sesión|Crear cuenta|Registro/);
});
