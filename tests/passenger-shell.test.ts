import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { createPassengerFixtureGateway } from '../src/dev/passenger/gateway.ts';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';
import { routeFitCandidate, usePassengerRouteFit } from '../src/features/passenger/usePassengerRouteFit.ts';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const clock = { after: () => () => {}, delay: async () => {} };
const quote = fixtureQuote({ origin: fixturePlaces[0]!, destination: fixturePlaces[1]!, stops: [] });
const host = (tree: ReactTestRenderer, name: string) => tree.root.findByType(name as never);
const id = (tree: ReactTestRenderer, testID: string) => tree.root.find(n => typeof n.type === 'string' && n.props.testID === testID);
const hasNav = (tree: ReactTestRenderer) => tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === 'passenger-bottom-navigation').length === 1;
const style = (node: ReactTestInstance) => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
const restingStyle = (node: ReactTestInstance) => Object.assign({}, ...node.props.style({ pressed: false }).filter(Boolean));
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

test('Motion 1.1 press and keyed short entries use approved values without spatial Reduced Motion', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced });
    const { VimaButton } = h.load('src/design/components/VimaButton.tsx');
    const { ElementEntrance } = h.load('src/motion/ElementEntrance.tsx');
    let button: ReactTestRenderer;
    await act(async () => { button = create(React.createElement(VimaButton, { label: 'Probar', onPress() {} })); });
    try {
      const pressable = button!.root.findByType('Pressable' as never);
      const before = h.animations.length;
      await act(async () => pressable.props.onPressIn());
      assert.equal(h.animations.length - before, reduced ? 0 : 1);
      if (!reduced) assert.deepEqual([h.animations.at(-1).value, h.animations.at(-1).duration], [0.98, 120]);
      await act(async () => pressable.props.onPressOut());
      if (!reduced) assert.deepEqual([h.animations.at(-1).value, h.animations.at(-1).duration], [1, 120]);
    } finally { await act(async () => button!.unmount()); }
    let entry: ReactTestRenderer;
    await act(async () => { entry = create(React.createElement(ElementEntrance, { staggerIndex: 4 }, React.createElement('View'))); });
    try {
      const animated = entry!.root.findByType('AnimatedView' as never);
      assert.equal(style(animated).opacity, 0);
      assert.deepEqual(style(animated).transform, [{ translateY: reduced ? 0 : 6 }]);
      assert.equal(h.delays.at(-1), reduced ? undefined : 96);
      const count = h.delays.length;
      await act(async () => entry!.update(React.createElement(ElementEntrance, { staggerIndex: 0 }, React.createElement('View'))));
      assert.equal(h.delays.length, count); // Same keyed unit never restaggers on re-render.
      assert.equal(h.animations.at(-1).duration, 160);
    } finally { await act(async () => entry!.unmount()); }
    await act(async () => { entry = create(React.createElement(ElementEntrance, { staggerIndex: 5 }, React.createElement('View'))); });
    assert.equal(h.delays.length, reduced ? 0 : 1); // The sixth result has no delayed entrance.
    await act(async () => entry!.unmount());
  }
});

test('Home and Search share one 1900 ms glow clock with matching; background and Reduced Motion stop it', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced });
    const { SearchInputGlow, SearchPulse, useSearchCycle } = h.load('src/motion/SearchPulse.tsx');
    function Probe({ mode, focused = false }: { mode: 'home' | 'search' | 'matching' | null; focused?: boolean }) {
      const cycle = useSearchCycle(mode !== null);
      return mode === 'matching' ? React.createElement(SearchPulse, { visible: true, expanded: false, cycle })
        : mode ? React.createElement(SearchInputGlow, { cycle, home: mode === 'home', focused }) : null;
    }
    let tree: ReactTestRenderer;
    await act(async () => { tree = create(React.createElement(Probe, { mode: 'home' })); });
    try {
      const homeGlow = id(tree!, 'passenger-home-search-glow');
      assert.equal(style(homeGlow).boxShadow[0].color, '#00D68F');
      assert.equal(style(homeGlow).opacity, 0.18);
      const homeOpacity = style(homeGlow).opacity;
      assert.equal(h.repeats.length, reduced ? 0 : 1);
      if (!reduced) assert.ok(h.animations.some((animation: { duration: number }) => animation.duration === 1900));
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search' })));
      assert.equal(style(id(tree!, 'passenger-active-search-glow')).opacity, 0.20);
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search', focused: true })));
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search', focused: true })));
      const activeGlow = id(tree!, 'passenger-active-search-glow');
      assert.ok(style(activeGlow).opacity > homeOpacity);
      assert.ok(Math.abs(style(activeGlow).opacity - 0.34) < 1e-9);
      assert.equal(h.animations.at(-1).duration, 160);
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search' })));
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search' })));
      assert.equal(style(id(tree!, 'passenger-active-search-glow')).opacity, 0.20);
      assert.equal(h.repeats.length, reduced ? 0 : 1);
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'matching' })));
      assert.equal(h.repeats.length, reduced ? 0 : 1);
      assert.equal(tree!.root.findAll(n => n.props.testID === 'passenger-active-search-glow').length, 0);
      const beforeBackground = h.cancellations.length;
      await act(async () => h.setAppState('background'));
      assert.ok(h.cancellations.length > beforeBackground);
      assert.equal(h.repeats.length, reduced ? 0 : 1);
      await act(async () => h.setAppState('active'));
      assert.equal(h.repeats.length, reduced ? 0 : 2);
      const beforeHidden = h.cancellations.length;
      await act(async () => tree!.update(React.createElement(Probe, { mode: null })));
      assert.ok(h.cancellations.length > beforeHidden);
      assert.equal(h.repeats.length, reduced ? 0 : 2);
    } finally { await act(async () => tree!.unmount()); }
  }
});

test('Search results and Home rich recents use continuous list rows with fixed geometry', async () => {
  const h = createHarness(); const fixture = createPassengerFixtureGateway(clock);
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle();
    const frame = id(tree, 'passenger-home-search-frame');
    const pill = id(tree, 'passenger-home-floating-search');
    const glow = id(tree, 'passenger-home-search-glow');
    assert.equal(style(frame).position, 'relative');
    assert.equal(style(frame).height, 58);
    assert.equal(style(frame).marginHorizontal, 20);
    assert.equal(style(frame).alignSelf, 'stretch');
    assert.equal(restingStyle(pill).height, 58);
    assert.equal(restingStyle(pill).width, '100%');
    assert.equal(restingStyle(pill).marginHorizontal, undefined);
    assert.equal(restingStyle(pill).borderRadius, 24);
    assert.equal(restingStyle(pill).borderColor, '#00D68F');
    assert.ok(restingStyle(pill).boxShadow.length > 0);
    assert.deepEqual(Object.assign({}, ...pill.props.style({ pressed: true }).filter(Boolean)).boxShadow, []);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 32);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopRightRadius, 32);
    assert.equal(style(id(tree, 'passenger-sheet-header').find(n => style(n).backgroundColor === '#FFFFFF')).borderTopLeftRadius, 32);
    assert.equal(style(glow).borderRadius, 24);
    assert.deepEqual([style(glow).top, style(glow).right, style(glow).bottom, style(glow).left], [0, 0, 0, 0]);
    assert.equal(style(glow).position, 'absolute');
    assert.equal(style(glow).opacity, 0.18);
    assert.equal(frame.findAll(n => n.props.testID === 'passenger-home-search-glow').length, 1);
    const homeRecent = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel?.includes('Plaza Atlacomulco'));
    assert.ok(homeRecent);
    assert.equal(restingStyle(homeRecent).boxShadow, undefined);
    assert.equal(restingStyle(homeRecent).borderBottomWidth, 1);
    assert.ok(homeRecent.findAll(n => n.props.size === 64 && typeof n.type === 'function' && n.type.name === 'PlaceThumbnail').length === 1);
    assert.ok(homeRecent.findAll(n => n.props.numberOfLines === 2).length >= 1);
    await press(tree, '¿A dónde vamos?');
    const input = host(tree, 'TextInput');
    const fieldHeight = style(id(tree, 'passenger-search-field')).height;
    await act(async () => input.props.onFocus());
    assert.equal(style(id(tree, 'passenger-search-field')).height, fieldHeight);
    assert.equal(style(id(tree, 'passenger-search-field')).borderColor, '#00826F');
    await act(async () => input.props.onBlur());
    assert.equal(style(id(tree, 'passenger-search-field')).borderColor, '#00D68F');
    assert.ok(id(tree, 'passenger-active-search-glow'));
    await act(async () => input.props.onChangeText('Plaza'));
    await settle();
    const results = id(tree, 'passenger-search-results');
    const rows = results.findAllByType('Pressable' as never);
    assert.ok(rows.length >= 1);
    for (const row of rows) {
      const resting = restingStyle(row);
      assert.equal(resting.boxShadow, undefined);
      assert.equal(resting.minHeight, 56);
      assert.equal(resting.borderBottomWidth, 1);
      assert.ok(row.findAll(n => n.props.size === 48 && typeof n.type === 'function' && n.type.name === 'PlaceThumbnail').length === 1);
      assert.ok(row.findAll(n => n.props.name === 'chevron').length >= 1);
      assert.ok(row.props.accessibilityLabel.includes('Plaza'));
    }
    const before = h.animations.length;
    await act(async () => rows[0]!.props.onPressIn());
    assert.deepEqual([h.animations.at(-1).value, h.animations.at(-1).duration], [0.98, 120]);
    await act(async () => rows[0]!.props.onPressOut());
    assert.ok(h.animations.length > before);
    assert.ok(h.delays.includes(24));
    assert.equal(fieldHeight, 52);
    assert.ok(id(tree, 'passenger-active-search-glow'));
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-home-search-glow').length, 0);
    assert.equal(h.repeats.length, 1);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('Search suggestions and saved, recent, popular and local collections keep one list presentation', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const favorite = { ...fixturePlaces[1]!, id: 'favorite', name: 'Favorito de prueba' };
  const recent = { ...fixturePlaces[2]!, id: 'recent', name: 'Reciente de prueba' };
  const popular = { ...fixturePlaces[3]!, id: 'popular', name: 'Popular de prueba' };
  const featured = { ...fixturePlaces[0]!, id: 'featured', name: 'Local de prueba' };
  const tree: ReactTestRenderer = await h.render({ ...fixture.gateway,
    favoritePlaces: async () => [favorite], recentPlaces: async () => [recent],
    discoverPlaces: async () => ({ popular: [popular], featured: [featured] }),
  });
  try {
    await settle(); await press(tree, '¿A dónde vamos?'); await settle();
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 32);
    for (const place of [favorite, recent, popular, featured]) {
      const row = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === `${place.name}, ${place.address}`);
      assert.ok(row, place.name);
      assert.equal(restingStyle(row).boxShadow, undefined);
      assert.equal(restingStyle(row).borderBottomWidth, 1);
      assert.ok(row.findAll(n => n.props.size === 48 && typeof n.type === 'function' && n.type.name === 'PlaceThumbnail').length === 1);
      assert.ok(row.findAll(n => n.props.name === 'chevron').length >= 1);
    }
    assert.equal(h.delays.length, 0); // Initial collections do not stagger on re-render.
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('Reduced Motion keeps permanent green borders and stationary halos in Home and Search', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness({}, { reduced: true });
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle();
    assert.equal(restingStyle(id(tree, 'passenger-home-floating-search')).borderColor, '#00D68F');
    assert.equal(style(id(tree, 'passenger-home-search-glow')).opacity, 0.18);
    await press(tree, '¿A dónde vamos?');
    assert.equal(style(id(tree, 'passenger-search-field')).borderColor, '#00D68F');
    assert.equal(style(id(tree, 'passenger-active-search-glow')).opacity, 0.20);
    assert.equal(h.repeats.length, 0);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('review and confirmation separate green-outlined address surfaces without changing map or sheet identity', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  const checkAddresses = () => {
    const origin = id(tree, 'passenger-origin-surface');
    const destination = id(tree, 'passenger-destination-surface');
    const stack = origin.parent;
    assert.ok(stack);
    assert.equal(stack, destination.parent);
    assert.equal(style(stack).gap, 8);
    assert.equal(stack.findAll(n => style(n).backgroundColor === 'rgba(11, 15, 14, 0.08)' && style(n).height === 1).length, 0);
    for (const surface of [origin, destination]) {
      const s = style(surface);
      assert.equal(s.borderColor, '#00D68F');
      assert.equal(s.borderRadius, 16);
      assert.equal(s.boxShadow.length, 1);
      assert.equal(s.boxShadow[0].offsetY, 0);
    }
    assert.equal(origin.findAll(n => style(n).backgroundColor === '#00D68F').length >= 1, true);
    assert.equal(destination.findAll(n => style(n).backgroundColor === '#FF3830').length >= 1, true);
    assert.ok(origin.findAllByType('Pressable' as never).length >= 1);
    assert.ok(destination.findAllByType('Pressable' as never).length >= 1);
  };
  try {
    await settle(); await press(tree, '¿A dónde vamos?');
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    checkAddresses();
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 32);
    assert.equal(h.repeats.length, 1);
    await press(tree, 'Confirmar ubicaciones'); await settle();
    checkAddresses();
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 32);
    assert.equal(h.repeats.length, 1);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
    await press(tree, 'Solicitar viaje'); await settle();
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, undefined);
    assert.equal(h.repeats.length, 2); // Home stops before matching starts its use of the shared cycle.
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-active-search-glow').length, 0);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('destination Search moves only its title onto the map and keeps sheet geometry and input position', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(); await mapLayout(tree);
    const homeHeader = id(tree, 'passenger-sheet-header');
    assert.equal(style(homeHeader.find(n => style(n).backgroundColor === '#FFFFFF')).borderTopLeftRadius, 32);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).borderBottomLeftRadius, 32);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).borderBottomRightRadius, 32);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).backgroundColor, '#FFFFFF');
    await press(tree, '¿A dónde vamos?');
    const searchTitle = id(tree, 'passenger-destination-search-title');
    const searchTitleStyle = style(searchTitle);
    const searchTitleTextStyle = style(searchTitle.findByType('Text' as never));
    const header = id(tree, 'passenger-sheet-header');
    assert.equal(header.findAll(n => n.props.children === '¿A dónde vamos?').length, 0);
    assert.equal(style(id(tree, 'passenger-search-title-reserve')).height, 27);
    assert.equal(style(searchTitle).height, 40);
    assert.equal(style(searchTitle).top, 40);
    assert.equal(style(searchTitle).alignSelf, 'center');
    assert.deepEqual(style(searchTitle).boxShadow, [{ offsetX: 0, offsetY: 2, blurRadius: 8,
      spreadDistance: 0, color: 'rgba(11, 15, 14, 0.06)' }]);
    assert.equal(style(searchTitle.findByType('Text' as never)).fontSize, 16);
    assert.equal(style(searchTitle.findByType('Text' as never)).fontWeight, '600');
    assert.equal(id(tree, 'passenger-sheet-viewport').findAll(n => n.props.testID === 'passenger-search-field').length, 1);
    assert.equal(host(tree, 'SheetBoundary').props.interaction.targetOffset, 84);
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-destination-search-title').length, 0);
    await press(tree, 'Confirmar ubicaciones');
    const confirmation = id(tree, 'passenger-confirmation-pill');
    assert.deepEqual(style(confirmation), searchTitleStyle);
    assert.deepEqual(style(confirmation.findByType('Text' as never)), searchTitleTextStyle);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('phase presence exits and enters at approved durations and 12 dp, with one driver-found scene', async () => {
  for (const reduced of [false, true]) {
    const fixture = createPassengerFixtureGateway(clock); const h = createHarness({}, { reduced });
    const tree: ReactTestRenderer = await h.render(fixture.gateway);
    const presence = () => id(tree, 'passenger-phase-presence');
    const check = (duration: number) => {
      const node = presence();
      assert.equal(node.props.exiting.durationMs, duration);
      assert.equal(node.props.exiting.kind, reduced ? 'FadeOut' : 'FadeOutUp');
      if (reduced) assert.deepEqual(style(node).transform, [{ translateY: 0 }]);
      else assert.deepEqual(node.props.exiting.target.transform, [{ translateY: -12 }]);
    };
    try {
      await settle(); check(300);
      assert.ok(h.animations.some((a: { value: number; duration: number }) => a.value === 1 && a.duration === 300));
      await press(tree, '¿A dónde vamos?'); check(300);
      await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`); check(240);
      await press(tree, 'Confirmar ubicaciones'); check(240);
      await press(tree, 'Solicitar viaje'); check(480);
      assert.ok(tree.root.findAll(n => n.props.testID === 'passenger-active-search-glow').length === 0);
      await act(async () => fixture.controls.advance('assigned')); await settle(); check(480);
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-active-search-glow').length, 0);
      assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
    } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
  }
});
async function press(tree: ReactTestRenderer, label: string) {
  const node = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label && n.props.onPress);
  assert.ok(node, label); assert.ok(!node.props.disabled);
  await act(async () => node.props.onPress()); await settle();
}
async function mapLayout(tree: ReactTestRenderer, previousSheetFrameHeight = 700) {
  await act(async () => id(tree, 'passenger-map-surface').props.onLayout({ nativeEvent: {
    layout: { width: 390, height: previousSheetFrameHeight + 28 } } }));
}
async function measure(tree: ReactTestRenderer, content = 250, header = 28) {
  await act(async () => {
    id(tree, 'passenger-sheet-content').props.onLayout({ nativeEvent: { layout: { height: content } } });
    id(tree, 'passenger-sheet-header').props.onLayout({ nativeEvent: { layout: { height: header } } });
  });
  const interaction = host(tree, 'SheetBoundary').props.interaction;
  const visible = interaction.height - interaction.targetOffset;
  await act(async () => {
    id(tree, 'passenger-sheet-viewport').props.onLayout({ nativeEvent: { layout: { height: visible - header } } });
    host(tree, 'SheetBoundary').props.onVisibleHeightChange(visible);
  });
  return visible;
}

test('transparent dark-content status bar overlays the clipped map; safe chrome, sheet and nav retain their geometry', async () => {
  for (const [top, bottom] of [[0, 0], [24, 16], [48, 34]]) {
    const h = createHarness({}, { insets: { top, bottom, left: 0, right: 0 } });
    const fixture = createPassengerFixtureGateway(clock); const tree: ReactTestRenderer = await h.render(fixture.gateway);
    try {
      await settle();
      assert.equal(style(id(tree, 'passenger-root')).backgroundColor, '#F6F7F8');
      assert.equal(tree.root.findAllByType('SafeAreaView' as never).length, 0);
      assert.equal(host(tree, 'StatusBar').props.style, 'dark');
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-map-top-gap').length, 0);
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-status-surface').length, 0);
      const surface = id(tree, 'passenger-map-surface');
      assert.equal(style(surface).flex, 1);
      assert.equal(style(surface).marginHorizontal, undefined);
      assert.equal(style(surface).overflow, undefined);
      assert.equal(surface.props.collapsable, false);
      await act(async () => surface.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 + top! + 4 } } }));
      assert.equal(host(tree, 'SheetBoundary').props.interaction.height, 768);
      const mapViewport = surface.findAllByType('View' as never).find(n => style(n).marginHorizontal === 4);
      assert.ok(mapViewport);
      assert.equal(mapViewport!.props.collapsable, false);
      assert.equal(style(mapViewport!).borderTopLeftRadius, 24); assert.equal(style(mapViewport!).borderTopRightRadius, 24);
      assert.equal(style(mapViewport!).overflow, 'hidden'); assert.equal(style(mapViewport!).borderWidth, undefined);
      assert.equal(mapViewport!.findAllByType('NativeMapBoundary' as never).length, 1);
      assert.equal(mapViewport!.findAllByType('SheetBoundary' as never).length, 0);
      assert.equal(style(host(tree, 'SheetBoundary')).marginHorizontal, undefined);
      const chrome = id(tree, 'passenger-top-chrome');
      assert.equal(style(chrome).position, 'absolute'); assert.equal(style(chrome).top, top! + 8);
      assert.equal(style(chrome).minHeight, 44); assert.equal(style(chrome).right, 16);
      assert.equal(style(chrome).left, 16); assert.equal(style(chrome).backgroundColor, undefined);
      assert.equal(host(tree, 'PassengerMapContent').props.topOcclusion, top! + 72);
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 0);
      const logo = chrome.findByType('Image' as never);
      assert.match(logo.props.source, /vima_header_lockup_final\.png$/);
      assert.equal(style(logo).height, 32); assert.equal(style(logo).width, 672 * 32 / 200);
      assert.equal(style(chrome).top + (style(chrome).minHeight - style(logo).height) / 2, top! + 14);
      assert.equal(style(logo).backgroundColor, undefined);
      assert.deepEqual(style(logo).boxShadow, [{ offsetX: 0, offsetY: 2, blurRadius: 8,
        spreadDistance: 0, color: 'rgba(11, 15, 14, 0.06)' }]);
      for (const label of ['¿A dónde vamos?']) {
        const control = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label)!;
        const resting = Object.assign({}, ...control.props.style({ pressed: false }).filter(Boolean));
        assert.deepEqual(resting.boxShadow, style(logo).boxShadow);
      }
      const savedStrip = tree.root.findAllByType('View' as never).find(n => style(n).height === 44 && style(n).boxShadow);
      assert.deepEqual(style(savedStrip!).boxShadow, style(logo).boxShadow);
      const search = id(tree, 'passenger-home-floating-search');
      const searchStyle = Object.assign({}, ...search.props.style({ pressed: false }).filter(Boolean));
      assert.equal(searchStyle.height, 58); assert.equal(searchStyle.borderRadius, 24);
      assert.equal(searchStyle.marginHorizontal, undefined);
      assert.equal(style(id(tree, 'passenger-home-search-frame')).marginHorizontal, 20);
      const panelHeader = tree.root.findAllByType('View' as never).find(n =>
        style(n).borderTopLeftRadius === 32 && style(n).backgroundColor === '#FFFFFF');
      assert.ok(panelHeader);
      assert.equal(style(panelHeader!).boxShadow, undefined);
      assert.equal(style(id(tree, 'passenger-sheet-viewport')).boxShadow, undefined);
      assert.equal(style(id(tree, 'passenger-sheet-content')).gap, 8);
      const homeText = (label: string) => tree.root.findAll(n => String(n.type) === 'Text' && n.props.children === label)[0]!;
      for (const label of ['¿A dónde vamos?', 'Lugares guardados', 'Viajes recientes']) {
        assert.equal(style(homeText(label)).fontSize, 16);
      }
      assert.equal(tree.root.findAllByType('Pressable' as never).filter(n => ['Casa', 'Trabajo'].includes(n.props.accessibilityLabel)).length, 2);
      assert.equal(tree.root.findAllByType('Pressable' as never).some(n => String(n.props.accessibilityLabel).startsWith('+')), false);
      const homeIcon = tree.root.findAll(n => String(n.type) === 'Text' && style(n).fontSize === 20)[0];
      assert.ok(homeIcon);
      assert.equal(style(id(tree, 'passenger-sheet-header')).backgroundColor, undefined);
      assert.equal(style(id(tree, 'passenger-sheet-viewport')).backgroundColor, '#FFFFFF');
      assert.equal(host(tree, 'SheetBoundary').findAll(n => n.props.testID === 'passenger-home-floating-search').length, 1);
      assert.equal(id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-home-floating-search').length, 0);
      assert.equal(style(host(tree, 'SheetBoundary')).overflow, 'visible');
      assert.equal(style(host(tree, 'SheetBoundary')).backgroundColor, 'transparent');
      const notifications = chrome.findByType('Pressable' as never);
      assert.equal(notifications.props.accessibilityLabel, 'Notificaciones');
      assert.equal(notifications.props.accessibilityState.disabled, true); assert.equal(notifications.props.onPress, undefined);
      assert.equal(style(notifications).width, 52); assert.equal(style(notifications).height, 52);
      assert.equal(style(notifications).top, 0); assert.equal(style(notifications).right, 0);
      assert.equal(style(notifications.findByType('Text' as never)).fontSize, 24);
      assert.deepEqual(style(notifications).boxShadow, [{ offsetX: 0, offsetY: 8, blurRadius: 24,
        spreadDistance: 0, color: 'rgba(11, 15, 14, 0.1)' }]);
      await act(async () => host(tree, 'NativeMapBoundary').props.onDidFinishLoadingMap());
      const compass = id(tree, 'passenger-compass');
      assert.equal(chrome.findAll(n => n.props.testID === 'passenger-compass').length, 0);
      const controls = id(tree, 'passenger-map-controls');
      assert.deepEqual(controls.findAll(n => n.props.testID === 'passenger-compass' || n.props.accessibilityLabel === 'Capas del mapa')
        .map(n => n.props.testID ?? n.props.accessibilityLabel), ['passenger-compass', 'Capas del mapa']);
      assert.equal(style(compass).width, 44); assert.equal(style(compass).height, 44);
      assert.equal(style(compass).position, undefined);
      await press(tree, 'Capas del mapa');
      assert.ok(controls.findAll(n => style(n).minWidth === 192).length > 0);
      const incidentLabel = controls.findAll(n => String(n.type) === 'Text' && n.props.children === 'Incidentes')[0];
      assert.equal(incidentLabel?.props.numberOfLines, 1);
      assert.equal(host(tree, 'NativeMapBoundary').props.compass, false);
      assert.equal(notifications.props.hitSlop, 4);
      const nav = id(tree, 'passenger-bottom-navigation');
      assert.equal(surface.findAll(n => n.props.testID === 'passenger-bottom-navigation').length, 0);
      assert.equal(style(nav).marginHorizontal, undefined);
      assert.equal(style(nav).paddingBottom, Math.max(8, bottom!));
      assert.equal(style(nav).height, Math.max(72, 56 + bottom!));
      const tabs = nav.findAllByType('Pressable' as never);
      assert.deepEqual(tabs.map(n => n.props.accessibilityLabel), ['Inicio', 'Viajes', 'Pagos', 'Perfil']);
      assert.deepEqual(tabs.map(n => n.props.accessibilityState.disabled), [false, true, true, true]);
      assert.deepEqual(tabs.map(n => n.props.accessibilityState.selected), [true, false, false, false]);
      assert.ok(tabs.slice(1).every(n => n.props.onPress === undefined));
      assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
    } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
  }
});

test('Layers opens between the fixed compass and its own button with a compact anchor gap', async () => {
  for (const reduced of [false, true]) {
  const h = createHarness({}, { reduced });
  const { MapControls } = h.load('src/features/passenger/MapControls.tsx');
  let tree: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(MapControls, {
    available: true, layers: { traffic: false, incidents: false }, open: true,
    onOpen() {}, onToggle() {}, compass: React.createElement('View', { testID: 'compass-marker' }),
  })); });
  try {
    const nodes = tree!.root.findAll(n => typeof n.type === 'string');
    const compass = nodes.findIndex(n => n.props.testID === 'compass-marker');
    const menu = nodes.findIndex(n => n.props.testID === 'passenger-layers-menu');
    const layers = nodes.findIndex(n => n.props.accessibilityLabel === 'Capas del mapa');
    assert.ok(compass >= 0 && compass < menu && menu < layers);
    assert.equal(style(nodes[menu]!).minWidth, 192);
    assert.equal(style(tree!.root.findByType('AnimatedView' as never)).gap, 8);
    assert.equal(nodes[menu]!.props.entering.kind, reduced ? 'FadeIn' : 'FadeInDown');
    assert.equal(nodes[menu]!.props.exiting.kind, reduced ? 'FadeOut' : 'FadeOutUp');
    assert.equal(nodes[menu]!.props.entering.durationMs, 300);
    assert.equal(nodes[menu]!.props.exiting.durationMs, 240);
    if (!reduced) assert.deepEqual(nodes[menu]!.props.entering.initial.transform, [{ translateY: 6 }]);
    const incident = nodes.find(n => n.props.children === 'Incidentes');
    assert.equal(incident?.props.numberOfLines, 1);
  } finally { await act(async () => tree!.unmount()); }
  }
});

test('bottom navigation uses 240 ms short travel or fade-only by motion policy and keeps unavailable tabs disabled', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced });
    const { PassengerBottomNavigation } = h.load('src/features/passenger/PassengerBottomNavigation.tsx');
    let tree: ReactTestRenderer;
    await act(async () => { tree = create(React.createElement(PassengerBottomNavigation,
      { visible: true, bottomInset: 16, onHome() {} })); });
    try {
      const nav = id(tree!, 'passenger-bottom-navigation');
      assert.equal(nav.props.entering.kind, reduced ? 'FadeIn' : 'FadeInDown');
      assert.equal(nav.props.exiting.kind, reduced ? 'FadeOut' : 'FadeOutDown');
      assert.equal(nav.props.entering.durationMs, 240);
      assert.equal(nav.props.exiting.durationMs, 240);
      if (!reduced) {
        assert.deepEqual(nav.props.entering.initial.transform, [{ translateY: 12 }]);
        assert.deepEqual(nav.props.exiting.target.transform, [{ translateY: 12 }]);
      }
      for (const label of ['Viajes', 'Pagos', 'Perfil']) {
        const tab = tree!.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label)!;
        assert.equal(tab.props.disabled, true); assert.equal(tab.props.onPress, undefined);
      }
    } finally { await act(async () => tree!.unmount()); }
  }
});

test('bottom nav exists only in normal Home and returns after internal back without remounting map or sheet', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness({}, { reduced: true });
  let finish: () => void = () => {};
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const tree: ReactTestRenderer = await h.render({ ...fixture.gateway, request: async (...args: Parameters<typeof fixture.gateway.request>) => {
    await pending; return fixture.gateway.request(...args);
  } });
  try {
    await settle(); assert.equal(hasNav(tree), true);
    await press(tree, '¿A dónde vamos?'); assert.equal(hasNav(tree), false);
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    assert.equal(hasNav(tree), false); // Selection/reviewing has no nav.
    const destination = host(tree, 'PassengerMapContent').props.destination;
    await press(tree, 'Origen'); assert.equal(hasNav(tree), false);
    await act(async () => h.back()); await settle();
    assert.equal(hasNav(tree), false); assert.equal(host(tree, 'PassengerMapContent').props.destination.id, destination.id);
    await press(tree, 'Confirmar ubicaciones'); assert.equal(hasNav(tree), false);
    await press(tree, 'Volver'); assert.equal(hasNav(tree), true);
    await press(tree, '¿A dónde vamos?'); assert.equal(hasNav(tree), false);
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    await press(tree, 'Confirmar ubicaciones'); assert.equal(hasNav(tree), false);
    await press(tree, 'Solicitar viaje'); assert.equal(hasNav(tree), false); // Request is still pending.
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 0);
    await act(async () => finish()); await settle(); assert.equal(hasNav(tree), false);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 0);
    await act(async () => fixture.controls.advance('assigned')); await settle(); assert.equal(hasNav(tree), false);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 0);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.unmountedMap, 0); assert.equal(h.mounted.sheet, 1);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('rotating reveals the compass above Layers with only a 160 ms fade under either motion policy', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced });
    const fixture = createPassengerFixtureGateway(clock);
    const tree: ReactTestRenderer = await h.render(fixture.gateway);
    try {
      await settle(); await mapLayout(tree);
      await act(async () => host(tree, 'NativeMapBoundary').props.onDidFinishLoadingMap());
      assert.equal(id(tree, 'passenger-compass').props.pointerEvents, 'none');
      const before = h.animations.length;
      await act(async () => host(tree, 'NativeMapBoundary').props.onRegionIsChanging({ nativeEvent: { bearing: 90 } }));
      const compass = id(tree, 'passenger-compass');
      assert.equal(compass.props.pointerEvents, 'auto');
      assert.equal(style(compass).top, undefined); assert.equal(style(compass).right, undefined);
      assert.equal(style(compass).transform, undefined); // Appearance adds no translation or scale.
      assert.ok(h.animations.slice(before).some((a: { value: number; duration: number }) => a.value === 1 && a.duration === 160));
      const button = compass.findByType('Pressable' as never);
      const resting = Object.assign({}, ...button.props.style({ pressed: false }).filter(Boolean));
      assert.equal(resting.width, 44); assert.equal(resting.height, 44);
      assert.deepEqual(resting.boxShadow, [{ offsetX: 0, offsetY: 2, blurRadius: 8,
        spreadDistance: 0, color: 'rgba(11, 15, 14, 0.06)' }]);
      await act(async () => button.props.onPress());
      assert.equal(host(tree, 'PassengerMapContent').props.northRequest, 1);
      assert.equal(host(tree, 'PassengerMapContent').props.fitRoute, undefined);
      const beforeHide = h.animations.length;
      await act(async () => host(tree, 'NativeMapBoundary').props.onRegionIsChanging({ nativeEvent: { bearing: 360 } }));
      assert.equal(id(tree, 'passenger-compass').props.pointerEvents, 'none');
      assert.ok(h.animations.slice(beforeHide).some((a: { value: number; duration: number }) => a.value === 0 && a.duration === 160));
      assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
    } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
  }
});

test('only normal Home uses the 50% panel and detached search within the persistent sheet', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(); await mapLayout(tree);
    const homeHeight = await measure(tree, 250, 96);
    assert.equal(homeHeight, 700 * 0.50 + 68);
    assert.equal(host(tree, 'SheetBoundary').props.interaction.height, 768);
    assert.ok(Math.abs(homeHeight - 68 - 700 * 0.50) < 0.01);
    assert.equal(id(tree, 'passenger-home-floating-search').props.accessibilityLabel, '¿A dónde vamos?');
    assert.equal(style(host(tree, 'SheetBoundary')).overflow, 'visible');
    await press(tree, '¿A dónde vamos?');
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-home-floating-search').length, 0);
    assert.equal(style(host(tree, 'SheetBoundary')).overflow, 'hidden');
    assert.equal(host(tree, 'SheetBoundary').props.interaction.targetOffset, 84);
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    await mapLayout(tree); const reviewHeight = await measure(tree, 250);
    assert.equal(reviewHeight, 278); // Content + header, without Home's fixed percentage.
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('Home map controls and recenter share the measured search boundary after a pan', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(); await mapLayout(tree);
    const visibleHeight = await measure(tree, 250, 96);
    await act(async () => host(tree, 'NativeMapBoundary').props.onDidFinishLoadingMap());
    const map = () => host(tree, 'PassengerMapContent').props;
    const controls = id(tree, 'passenger-map-controls');
    const controlBottom = style(controls).bottom;
    assert.equal(visibleHeight, 418);
    assert.equal(map().homeBottomOcclusion, visibleHeight);
    assert.equal(controlBottom, visibleHeight + 8);
    assert.ok(728 - controlBottom - (44 * 2 + 8) >= map().topOcclusion);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-location-cta').length, 0);
    await act(async () => host(tree, 'NativeMapBoundary').props.onTouchStart());
    assert.equal(map().locationCtaVisible, true);
    assert.equal(style(id(tree, 'passenger-location-cta')).bottom, controlBottom);
    await act(async () => host(tree, 'NativeMapBoundary').props.onRegionDidChange({ nativeEvent: {
      center: [0, 0], userInteraction: true } }));
    await settle();
    assert.equal(style(id(tree, 'passenger-location-cta')).bottom, controlBottom);
    await act(async () => host(tree, 'SheetBoundary').props.onVisibleHeightChange(visibleHeight + 24));
    assert.equal(map().homeBottomOcclusion, visibleHeight + 24);
    assert.equal(style(id(tree, 'passenger-map-controls')).bottom, controlBottom + 24);
    assert.equal(style(id(tree, 'passenger-location-cta')).bottom, controlBottom + 24);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('confirmation title floats over the persistent map with approved geometry and no duplicate safe-area occlusion', async () => {
  for (const [reduced, top] of [[false, 0], [false, 48], [true, 48]] as const) {
    const fixture = createPassengerFixtureGateway(clock);
    const h = createHarness({}, { reduced, insets: { top, bottom: 34, left: 0, right: 0 } });
    const tree: ReactTestRenderer = await h.render(fixture.gateway);
    try {
      await settle();
      const surface = id(tree, 'passenger-map-surface');
      const homeSurface = style(surface);
      assert.equal(hasNav(tree), true);
      assert.equal(style(id(tree, 'passenger-sheet-content')).paddingBottom, 20);
      await press(tree, '¿A dónde vamos?');
      assert.equal(hasNav(tree), false);
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 0);
      await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
      assert.equal(hasNav(tree), false);
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 0);
      await press(tree, 'Confirmar ubicaciones');
      const pill = id(tree, 'passenger-confirmation-pill');
      const pillStyle = style(pill);
      assert.equal(pill.props.pointerEvents, 'none');
      assert.equal(pillStyle.position, 'absolute');
      assert.equal(pillStyle.top, top + 16);
      assert.equal(pillStyle.alignSelf, 'center');
      assert.equal(pillStyle.height, 40);
      assert.equal(pillStyle.paddingHorizontal, 16);
      assert.equal(pillStyle.width, undefined);
      assert.equal(pillStyle.borderRadius, 999);
      assert.equal(pillStyle.backgroundColor, '#FFFFFF');
      assert.equal(pillStyle.borderWidth, undefined);
      assert.deepEqual(pillStyle.boxShadow, [{ offsetX: 0, offsetY: 2, blurRadius: 8,
        spreadDistance: 0, color: 'rgba(11, 15, 14, 0.06)' }]);
      const label = pill.findByType('Text' as never);
      assert.equal(label.props.children, 'Confirma tu viaje');
      assert.equal(label.props.numberOfLines, 1);
      assert.equal(style(label).fontSize, 16);
      assert.equal(style(label).fontWeight, '600');
      assert.match(style(label).fontFamily, /Inter_600SemiBold/);
      assert.equal(style(label).color, '#0B0F0E');
      assert.equal(id(tree, 'passenger-top-chrome').findAll(n => n.props.children === 'Confirma tu viaje').length, 0);
      assert.equal(style(surface).flex, homeSurface.flex);
      assert.equal(style(surface).height, homeSurface.height);
      assert.equal(surface.findAll(n => typeof n.type === 'string' && n.props.testID === 'passenger-confirmation-pill').length, 1);
      assert.equal(hasNav(tree), false);
      assert.equal(style(id(tree, 'passenger-sheet-content')).paddingBottom, 54);
      assert.equal(host(tree, 'PassengerMapContent').props.topOcclusion, top + 72);
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-map-top-gap').length, 0);
      await press(tree, 'Volver');
      assert.equal(hasNav(tree), true);
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 0);
      assert.equal(h.mounted.map, 1);
      assert.equal(h.mounted.sheet, 1);
    } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
  }
});

test('review fit waits for actual phase layout; confirm emits an independent fit only after its new sheet settles', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  const fit = () => host(tree, 'PassengerMapContent').props.fitRoute;
  try {
    await settle(); await mapLayout(tree); await measure(tree);
    await act(async () => host(tree, 'NativeMapBoundary').props.onDidFinishLoadingMap());
    assert.equal(fit(), undefined);
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    assert.equal(fit(), undefined); // Home measurement and old nav layout cannot authorize reviewing.
    await mapLayout(tree); // The surface now recovers the bottom-nav space.
    const firstHeight = await measure(tree, 252);
    const first = fit(); assert.ok(first); assert.equal(first.sheetHeight, firstHeight);
    assert.equal(first.confirmationBottomPadding, 0);
    const map = host(tree, 'PassengerMapContent').props;
    assert.deepEqual(first.coordinates, [map.origin.coordinate, ...(map.quote.route.geometry.type === 'LineString' ? map.quote.route.geometry.coordinates : map.quote.route.geometry.coordinates.flat()), map.destination.coordinate]);
    await act(async () => host(tree, 'NativeMapBoundary').props.onTouchStart());
    await measure(tree, 254); assert.equal(fit().sequence, first.sequence);
    const oldViewport = id(tree, 'passenger-sheet-viewport').props.onLayout;
    await press(tree, 'Confirmar ubicaciones'); assert.equal(fit(), undefined);
    await act(async () => oldViewport({ nativeEvent: { layout: { height: firstHeight - 28 } } }));
    assert.equal(fit(), undefined);
    // Natural content alone is not a settled visible viewport.
    await act(async () => {
      id(tree, 'passenger-sheet-content').props.onLayout({ nativeEvent: { layout: { height: 340 } } });
      id(tree, 'passenger-sheet-header').props.onLayout({ nativeEvent: { layout: { height: 28 } } });
    });
    assert.equal(fit(), undefined);
    const finalHeight = await measure(tree, 340); const final = fit();
    assert.ok(final.sequence > first.sequence); assert.equal(final.sheetHeight, finalHeight);
    assert.equal(final.confirmationBottomPadding, 28);
    await measure(tree, 342); assert.equal(fit().sequence, final.sequence);
    await press(tree, `Destino ${fixturePlaces[1]!.name}`); assert.equal(fit(), undefined);
    const field = host(tree, 'TextInput'); await act(async () => field.props.onChangeText('Centro')); await settle();
    await mapLayout(tree, 772); await measure(tree, 240); assert.equal(fit(), undefined);
    await press(tree, `${fixturePlaces[2]!.name}, ${fixturePlaces[2]!.address}`);
    await measure(tree, 254);
    const next = fit(); assert.ok(next.sequence > final.sequence); // Search lock ended and nav remains hidden.
    await mapLayout(tree); await measure(tree, 254);
    assert.equal(fit().sequence, next.sequence);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('fit candidate includes every LineString/MultiLineString point and rejects invalid or stale geometry safely', () => {
  for (const geometry of [
    { type: 'LineString' as const, coordinates: [[-99, 19], [-100, 21], [-98, 20]] },
    { type: 'MultiLineString' as const, coordinates: [[[-99, 19], [-100, 21]], [[-98, 22], [-97, 23]]] },
  ]) {
    const current = { ...quote, route: { ...quote.route, geometry } };
    const before = JSON.stringify(current); const candidate = routeFitCandidate(current, quote.origin, quote.destination)!;
    const full = geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat();
    assert.deepEqual(candidate.coordinates, [quote.origin.coordinate, ...full, quote.destination.coordinate]);
    assert.equal(JSON.stringify(current), before);
  }
  assert.equal(routeFitCandidate(undefined, quote.origin, quote.destination), undefined);
  assert.equal(routeFitCandidate(quote, { ...quote.origin, id: 'other' }, quote.destination), undefined);
  const malformed = { ...quote, route: { ...quote.route, geometry: { type: 'LineString' as const, coordinates: [[NaN, 2]] } } };
  assert.equal(routeFitCandidate(malformed, quote.origin, quote.destination), undefined);
});

test('fit intent identity ignores renders/height/pan; a late quote never fits under Search lock', async () => {
  type Props = Parameters<typeof usePassengerRouteFit>[0];
  const initial: Props = { quote, origin: quote.origin, destination: quote.destination, reviewing: true, confirming: false,
    searchActive: false, ready: false, measuredSheetHeight: undefined };
  const Probe = (props: Props) => React.createElement('fit', { intent: usePassengerRouteFit(props) });
  let tree!: ReactTestRenderer; let props = initial;
  await act(async () => { tree = create(React.createElement(Probe, props)); });
  const update = async (patch: Partial<Props>) => { props = { ...props, ...patch }; await act(async () => tree.update(React.createElement(Probe, props))); };
  const fit = () => host(tree, 'fit').props.intent;
  try {
    await update({ ready: true }); assert.equal(fit(), undefined);
    await update({ measuredSheetHeight: 280 }); const first = fit(); assert.ok(first);
    await update({ measuredSheetHeight: 282 }); assert.equal(fit(), first);
    await update({}); assert.equal(fit(), first);
    await update({ searchActive: true, quote: { ...quote, id: 'new-quote' } }); assert.equal(fit(), undefined);
    await update({ searchActive: false, measuredSheetHeight: undefined }); assert.equal(fit(), undefined);
    await update({ measuredSheetHeight: 280 }); const second = fit(); assert.ok(second.sequence > first.sequence);
    await update({ reviewing: false, confirming: true, confirmationRequest: 1, measuredSheetHeight: undefined }); assert.equal(fit(), undefined);
    await update({ measuredSheetHeight: 390 }); assert.ok(fit().sequence > second.sequence);
    assert.equal(fit().sheetHeight, 390);
  } finally { await act(async () => tree.unmount()); }
});
