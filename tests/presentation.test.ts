import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import renderer from 'react-test-renderer';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);

test('button loading keeps its accessible action, blocks duplicate taps and stays static under Reduced Motion', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced });
    const { VimaButton } = h.load('src/design/components/VimaButton.tsx');
    let calls = 0;
    const scene = (loading: boolean) => React.createElement(VimaButton, { label: 'Llamar', icon: 'phone',
      secondary: true, communication: true, loading, onPress: () => { calls++; } });
    let tree!: renderer.ReactTestRenderer;
    await h.act(async () => { tree = renderer.create(scene(true)); });
    try {
      const busy = tree.root.findByType('Pressable' as never);
      assert.equal(busy.props.accessibilityLabel, 'Llamar');
      assert.equal(busy.props.accessibilityState.busy, true);
      assert.equal(busy.props.disabled, true);
      assert.equal(tree.root.findAllByType('ActivityIndicator' as never).length, reduced ? 0 : 1);
      const content = tree.root.findAllByType('View' as never)[0]!;
      const style = Object.assign({}, ...content.props.style.filter(Boolean));
      assert.equal(style.opacity === 0, !reduced);
      assert.equal(calls, 0);
      await h.act(async () => tree.update(scene(false)));
      const ready = tree.root.findByType('Pressable' as never);
      assert.equal(ready.props.disabled, false);
      await h.act(async () => ready.props.onPress());
      assert.equal(calls, 1);
      assert.equal(h.mounted.haptics.length, 1);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('map controls use approved size, elevation, pressed surface and semantic active color', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced });
    const { MapControls } = h.load('src/features/passenger/MapControls.tsx');
    const { mapControlSize } = h.load('src/features/passenger/mapCameraFootprint.ts');
    const { mapPersonality } = h.load('src/motion/mapPersonality.ts');
    assert.equal(mapControlSize, 44);
    assert.equal(mapPersonality.controlScale, 0.98);
    let tree!: renderer.ReactTestRenderer;
    await h.act(async () => { tree = renderer.create(React.createElement(MapControls, {
      available: true, layers: { traffic: true, incidents: false }, open: false,
      onOpen: () => {}, onToggle: () => {},
    })); });
    try {
      const control = tree.root.findByType('Pressable' as never);
      const flat = (pressed: boolean) => Object.assign({}, ...control.props.style({ pressed }).filter(Boolean));
      assert.equal(flat(false).width, 44); assert.equal(flat(false).height, 44);
      assert.equal(flat(false).backgroundColor, '#FFFFFF');
      assert.equal(flat(false).borderColor, '#00D68F');
      assert.deepEqual(flat(false).boxShadow, [{ offsetX: 0, offsetY: 8, blurRadius: 24,
        spreadDistance: 0, color: 'rgba(11, 15, 14, 0.1)' }]);
      assert.equal(flat(true).backgroundColor, '#F7F8F7');
      const glyph = control.findByType('Text' as never);
      assert.equal(glyph.props.style[0].fontSize, 24);
      assert.equal(glyph.props.style[1].color, '#00D68F');
      const wrapper = control.parent!;
      assert.equal(wrapper.props.style.transform[0].scale, 1);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('Home logo, internal surfaces, sheet, primary action and navigation follow approved depth and colors', async () => {
  const h = createHarness();
  const { lightTheme } = h.load('src/design/themes/light.ts');
  const { passengerSurfaces } = h.load('src/design/presentation.ts');
  const { VimaButton } = h.load('src/design/components/VimaButton.tsx');
  const { PassengerBottomNavigation } = h.load('src/features/passenger/PassengerBottomNavigation.tsx');
  const { elevationStyle } = h.load('src/design/themes/light.ts');
  assert.deepEqual(lightTheme.surfaces.sheet.boxShadow, elevationStyle('level2', '#0B0F0E').boxShadow);
  assert.deepEqual(passengerSurfaces.floating.boxShadow, lightTheme.surfaces.sheet.boxShadow);
  let button!: renderer.ReactTestRenderer;
  await h.act(async () => { button = renderer.create(React.createElement(VimaButton, { label: 'Solicitar viaje', onPress: () => {} })); });
  try {
    const flat = Object.assign({}, ...button.root.findByType('Pressable' as never).props.style({ pressed: false }).filter(Boolean));
    assert.equal(flat.backgroundColor, '#00D68F');
    assert.deepEqual(flat.boxShadow, elevationStyle('level1', '#0B0F0E').boxShadow);
  } finally { await h.act(async () => button.unmount()); }
  let nav!: renderer.ReactTestRenderer;
  await h.act(async () => { nav = renderer.create(React.createElement(PassengerBottomNavigation,
    { visible: true, bottomInset: 16, onHome: () => {} })); });
  try {
    const tabs = nav.root.findAllByType('Pressable' as never);
    assert.equal(tabs.length, 4);
    for (const [index, tab] of tabs.entries()) {
      const label = tab.findAllByType('Text' as never).at(-1)!;
      const labelStyle = Object.assign({}, ...[label.props.style].flat(Infinity).filter(Boolean));
      assert.equal(labelStyle.color,
        index === 0 ? '#00826F' : '#2A2E2D');
    }
  } finally { await h.act(async () => nav.unmount()); }
});
