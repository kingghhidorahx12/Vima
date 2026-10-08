import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import renderer from 'react-test-renderer';
import { lightTheme } from '../src/design/themes/light.ts';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
Reflect.set(globalThis, '__DEV__', true);

test('approved VimaText variants render and the Passenger DEV account gate mounts without an invalid body variant', async () => {
  const h = createHarness();
  const { VimaText } = h.load('src/design/primitives/index.tsx');
  const { LiveAccountGate } = h.load('src/dev/LiveAccountGate.tsx');
  const variants = ['h1', 'h2', 'h3', 'bodyRegular', 'bodyMedium', 'bodySmall', 'caption'] as const;
  let tree!: renderer.ReactTestRenderer;
  await h.act(async () => { tree = renderer.create(React.createElement(React.Fragment, null,
    ...variants.map(variant => React.createElement(VimaText, { key: variant, variant }, variant)))); });
  try {
    const texts = tree.root.findAllByType('Text' as never);
    assert.equal(texts.length, variants.length);
    variants.forEach((variant, index) => assert.deepEqual(texts[index]!.props.style[0], lightTheme.text[variant]));
  } finally { await h.act(async () => tree.unmount()); }

  await h.act(async () => { tree = renderer.create(React.createElement(h.QueryClientProvider, { client: h.client },
    // A render prop is the component's declared children contract.
    // eslint-disable-next-line react/no-children-prop
    React.createElement(LiveAccountGate, { role: 'passenger', children: () => null }))); });
  try {
    const copy = tree.root.findAllByType('Text' as never).map(node => node.props.children).flat(Infinity).join(' ');
    assert.match(copy, /Cuenta DEV ·\s+Passenger/);
    assert.match(copy, /Token de la configuración externa/);
  } finally { await h.act(async () => tree.unmount()); h.client.clear(); }
});

test('button loading crossfades in one frame, remains visible under Reduced Motion and blocks duplicate taps', async () => {
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
      assert.equal(tree.root.findAllByType('ActivityIndicator' as never).length, 1);
      const spinner = tree.root.findByType('ActivityIndicator' as never);
      assert.equal(spinner.props.accessibilityLabel, 'Cargando');
      assert.equal(spinner.parent!.props.style.at(-1).opacity, 1);
      const labelLayer = () => tree.root.findAllByType('AnimatedView' as never).find(node =>
        node.props.style?.[0]?.flexDirection === 'row')!;
      assert.equal(labelLayer().props.style.at(-1).opacity, 0);
      const height = Object.assign({}, ...busy.props.style({ pressed: false }).filter(Boolean)).minHeight;
      assert.equal(calls, 0);
      await h.act(async () => tree.update(scene(false)));
      // The renderer mock evaluates animated styles on render; native Reanimated updates them on the UI thread.
      await h.act(async () => tree.update(scene(false)));
      const ready = tree.root.findByType('Pressable' as never);
      assert.equal(ready.props.disabled, false);
      assert.equal(Object.assign({}, ...ready.props.style({ pressed: false }).filter(Boolean)).minHeight, height);
      assert.equal(tree.root.findByType('ActivityIndicator' as never).parent!.props.style.at(-1).opacity, 0);
      assert.equal(labelLayer().props.style.at(-1).opacity, 1);
      assert.ok(h.animations.some((animation: { duration: number }) => animation.duration === 180));
      await h.act(async () => ready.props.onPress());
      assert.equal(calls, 1);
      assert.equal(h.mounted.haptics.length, 1);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('button disabled state fades over 180 ms without resizing or spatial Reduced Motion', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced }); const { VimaButton } = h.load('src/design/components/VimaButton.tsx');
    const scene = (disabled: boolean) => React.createElement(VimaButton, { label: 'Confirmar', disabled, onPress() {} });
    let tree!: renderer.ReactTestRenderer;
    await h.act(async () => { tree = renderer.create(scene(true)); });
    try {
      const pressable = () => tree.root.findByType('Pressable' as never);
      const flat = () => Object.assign({}, ...pressable().props.style({ pressed: false }).filter(Boolean));
      const height = flat().minHeight;
      assert.equal(pressable().props.onPressIn, undefined);
      assert.equal(pressable().props.disabled, true);
      const content = () => tree.root.findAllByType('AnimatedView' as never).find(node => node.props.style?.[0]?.flexDirection === 'row')!;
      const disabledLayer = () => tree.root.findAllByType('AnimatedView' as never).find(node =>
        Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean)).backgroundColor === lightTheme.roles.disabledSurface)!;
      assert.equal(content().props.style.at(-1).opacity, 0.65);
      await h.act(async () => tree.update(scene(false)));
      await h.act(async () => tree.update(scene(false)));
      assert.equal(flat().minHeight, height);
      assert.equal(pressable().props.disabled, false);
      assert.equal(disabledLayer().props.style.at(-1).opacity, 0);
      assert.ok(h.animations.some((animation: { duration: number }) => animation.duration === 180));
      await h.act(async () => tree.update(scene(true)));
      await h.act(async () => tree.update(scene(true)));
      assert.equal(flat().minHeight, height);
      assert.equal(pressable().props.onPressIn, undefined);
      assert.equal(content().props.style.at(-1).opacity, 0.65);
      assert.equal(disabledLayer().props.style.at(-1).opacity, 1);
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
    assert.equal(mapPersonality.controlScale, 0.97);
    let tree!: renderer.ReactTestRenderer;
    await h.act(async () => { tree = renderer.create(React.createElement(MapControls, {
      available: true, layers: { traffic: true, incidents: false }, open: false,
      onOpen: () => {}, onToggle: () => {},
    })); });
    try {
      const control = tree.root.findByProps({ accessibilityLabel: 'Capas del mapa' });
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
      const before = h.animations.filter((a: { value: number }) => a.value === 0.97).length;
      await h.act(async () => control.props.onPressIn());
      assert.equal(h.animations.filter((a: { value: number }) => a.value === 0.97).length, before + (reduced ? 0 : 1));
      assert.deepEqual(flat(true).boxShadow, []);
    } finally { await h.act(async () => tree.unmount()); }
  }
});

test('compass and location CTA have one press owner and compressed shadow without changing dimensions', async () => {
  const h = createHarness();
  const { MapCompass } = h.load('src/features/passenger/MapCompass.tsx');
  const { LocationCTA } = h.load('src/features/passenger/MapControls.tsx');
  for (const component of [React.createElement(MapCompass, { bearing: 20, ready: true, onPress() {} }),
    React.createElement(LocationCTA, { busy: false, onPress() {} })]) {
    let tree!: renderer.ReactTestRenderer;
    await h.act(async () => { tree = renderer.create(component); });
    try {
      const pressable = tree.root.findByType('Pressable' as never);
      const before = h.animations.filter((a: { value: number }) => a.value === 0.97).length;
      await h.act(async () => pressable.props.onPressIn());
      assert.equal(h.animations.filter((a: { value: number }) => a.value === 0.97).length, before + 1);
      assert.equal(Object.assign({}, ...pressable.props.style({ pressed: true }).filter(Boolean)).boxShadow.length, 0);
      await h.act(async () => pressable.props.onPressOut());
      assert.deepEqual([h.animations.at(-1).value, h.animations.at(-1).duration], [1, 160]);
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
    const beforePress = h.animations.filter((a: { value: number }) => a.value === 0.97).length;
    await h.act(async () => tabs[0]!.props.onPressIn());
    assert.equal(h.animations.filter((a: { value: number }) => a.value === 0.97).length, beforePress + 1);
    assert.equal(Object.assign({}, ...tabs[0]!.props.style({ pressed: true }).filter(Boolean)).backgroundColor, '#EAF3FF');
    for (const unavailable of tabs.slice(1)) assert.equal(unavailable.props.onPressIn, undefined);
    for (const [index, tab] of tabs.entries()) {
      const labels = tab.findAllByType('Text' as never).filter(n => n.props.children === tab.props.accessibilityLabel);
      assert.equal(labels.length, 2);
      assert.equal(Object.assign({}, ...[labels[0]!.props.style].flat(Infinity).filter(Boolean)).color, '#2A2E2D');
      assert.equal(Object.assign({}, ...[labels[1]!.props.style].flat(Infinity).filter(Boolean)).color, '#00826F');
      const colorLayers = tab.findAllByType('AnimatedView' as never).filter(n => n.props.style?.at?.(-1)?.opacity !== undefined);
      assert.deepEqual(colorLayers.map(n => n.props.style.at(-1).opacity), index === 0 ? [0, 1] : [1, 0]);
    }
  } finally { await h.act(async () => nav.unmount()); }
});
