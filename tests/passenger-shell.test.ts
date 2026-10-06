import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { createPassengerFixtureGateway } from '../src/dev/passenger/gateway.ts';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';
import { glyphCodepoints } from '../src/design/glyphs.ts';
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
const assertDetachedSurface = (tree: ReactTestRenderer) => {
  const header = id(tree, 'passenger-sheet-header');
  const panelHeader = id(tree, 'passenger-panel-header');
  const background = id(tree, 'passenger-panel-background');
  const viewport = id(tree, 'passenger-sheet-viewport');
  assert.equal(panelHeader.findAll(n => n.props.testID === 'passenger-panel-background').length, 1);
  assert.equal(header.findAll(n => n.props.testID === 'passenger-panel-background').length, 1);
  assert.equal(viewport.findAll(n => n.props.testID === 'passenger-panel-background').length, 0);
  const panelOrder = header.findAll(n => ['passenger-home-search-frame', 'passenger-search-field',
    'passenger-panel-header', 'passenger-panel-background'].includes(n.props.testID))
    .map(n => n.props.testID);
  assert.ok(panelOrder.indexOf('passenger-panel-header') < panelOrder.indexOf('passenger-panel-background'));
  const field = panelOrder.find(n => n === 'passenger-home-search-frame' || n === 'passenger-search-field');
  assert.ok(field && panelOrder.indexOf(field) > panelOrder.indexOf('passenger-panel-header'));
  assert.equal(background.props.pointerEvents, 'none');
  assert.deepEqual([style(background).position, style(background).top, style(background).left, style(background).right],
    ['absolute', 0, 0, 0]);
  assert.equal(style(background).backgroundColor, '#FFFFFF');
  assert.deepEqual([style(background).borderTopLeftRadius, style(background).borderTopRightRadius,
    style(background).borderBottomLeftRadius, style(background).borderBottomRightRadius], [40, 40, 0, 0]);
  const interaction = host(tree, 'SheetBoundary').props.interaction;
  if (interaction) assert.equal(style(background).height, interaction.height);
  assert.equal(style(panelHeader).backgroundColor, undefined);
  assert.equal(style(panelHeader).borderTopLeftRadius, undefined);
  assert.equal(style(panelHeader).borderTopRightRadius, undefined);
  assert.equal(style(viewport).backgroundColor, 'transparent');
  assert.equal(style(viewport).overflow, 'hidden');
  assert.equal(style(viewport).borderBottomLeftRadius, 0);
  assert.equal(style(viewport).borderBottomRightRadius, 0);
};

test('Motion 1.2 press/release and keyed entries use approved values without spatial Reduced Motion', async () => {
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
      if (!reduced) assert.deepEqual([h.animations.at(-1).value, h.animations.at(-1).duration], [0.97, 110]);
      await act(async () => pressable.props.onPressOut());
      if (!reduced) assert.deepEqual([h.animations.at(-1).value, h.animations.at(-1).duration], [1, 160]);
    } finally { await act(async () => button!.unmount()); }
    let entry: ReactTestRenderer;
    await act(async () => { entry = create(React.createElement(ElementEntrance, { staggerIndex: 4 }, React.createElement('View'))); });
    try {
      const animated = entry!.root.findByType('AnimatedView' as never);
      assert.equal(style(animated).opacity, 0);
      assert.deepEqual(style(animated).transform, [{ translateY: reduced ? 0 : 6 }]);
      assert.equal(h.delays.at(-1), reduced ? undefined : 112);
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

test('Passenger Home, Search and address controls have exactly one 0.97 press owner', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  const pressFeedback = async (label: string) => {
    const control = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label && !n.props.disabled);
    assert.ok(control?.props.onPressIn, label);
    const before = h.animations.filter((a: { value: number }) => a.value === 0.97).length;
    await act(async () => control.props.onPressIn());
    assert.equal(h.animations.filter((a: { value: number }) => a.value === 0.97).length, before + 1, label);
    await act(async () => control.props.onPressOut());
    assert.deepEqual([h.animations.at(-1).value, h.animations.at(-1).duration], [1, 160], label);
  };
  try {
    await settle();
    for (const label of ['¿A dónde vamos?', 'Casa', 'Trabajo', 'Favoritos', 'Ver todos',
      `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`]) await pressFeedback(label);
    await press(tree, '¿A dónde vamos?');
    await pressFeedback('Volver');
    await pressFeedback(`${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    await pressFeedback('Origen');
    await pressFeedback(`Destino ${fixturePlaces[1]!.name}`);
    await pressFeedback('Confirmar ubicaciones');
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-address-halo').length, 1);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('Home and Search halos stay static; only matching uses the approved 1900 ms clock', async () => {
  for (const reduced of [false, true]) {
    const h = createHarness({}, { reduced });
    const { SearchInputGlow, SearchPulse, useSearchCycle } = h.load('src/motion/SearchPulse.tsx');
    function Probe({ mode, focused = false }: { mode: 'home' | 'search' | 'matching' | null; focused?: boolean }) {
      const cycle = useSearchCycle(mode === 'matching');
      return mode === 'matching' ? React.createElement(SearchPulse, { visible: true, expanded: false, cycle })
        : mode ? React.createElement(SearchInputGlow, { home: mode === 'home', focused }) : null;
    }
    let tree: ReactTestRenderer;
    await act(async () => { tree = create(React.createElement(Probe, { mode: 'home' })); });
    try {
      const homeGlow = id(tree!, 'passenger-home-search-glow');
      assert.equal(style(homeGlow).boxShadow[0].color, '#00D68F');
      assert.equal(style(homeGlow).opacity, 0.18);
      const homeOpacity = style(homeGlow).opacity;
      assert.equal(h.repeats.length, 0);
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search' })));
      assert.equal(style(id(tree!, 'passenger-active-search-glow')).opacity, 0.20);
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search', focused: true })));
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search', focused: true })));
      const activeGlow = id(tree!, 'passenger-active-search-glow');
      assert.ok(style(activeGlow).opacity > homeOpacity);
      assert.ok(Math.abs(style(activeGlow).opacity - 0.38) < 1e-9);
      assert.equal(h.animations.at(-1).duration, 160);
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search' })));
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'search' })));
      assert.equal(style(id(tree!, 'passenger-active-search-glow')).opacity, 0.20);
      assert.equal(h.repeats.length, 0);
      await act(async () => tree!.update(React.createElement(Probe, { mode: 'matching' })));
      assert.equal(h.repeats.length, reduced ? 0 : 1);
      if (!reduced) assert.ok(h.animations.some((animation: { duration: number }) => animation.duration === 1900));
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
    const pill = id(tree, 'passenger-home-search');
    const glow = id(tree, 'passenger-home-search-glow');
    assert.equal(style(frame).position, 'relative');
    assert.equal(style(frame).height, 58);
    assert.equal(style(frame).marginHorizontal, undefined);
    assert.equal(style(frame).alignSelf, 'stretch');
    assert.equal(style(frame).width, undefined);
    assert.equal(restingStyle(pill).height, 58);
    assert.equal(restingStyle(pill).width, '100%');
    assert.equal(restingStyle(pill).paddingHorizontal, 24);
    assert.equal(restingStyle(pill).marginHorizontal, undefined);
    assert.equal(restingStyle(pill).borderRadius, 24);
    assert.equal(restingStyle(pill).gap, 10);
    assert.equal(restingStyle(pill).alignItems, 'center');
    assert.equal(restingStyle(pill).justifyContent, 'flex-start');
    assert.equal(restingStyle(pill).paddingLeft, undefined);
    assert.equal(restingStyle(pill).paddingRight, undefined);
    const iconFrame = id(tree, 'passenger-home-search-icon-frame');
    assert.equal(style(iconFrame).width, 24);
    assert.equal(style(iconFrame).height, 24);
    assert.equal(style(iconFrame).alignItems, 'center');
    assert.equal(style(iconFrame).justifyContent, 'center');
    const searchGlyph = iconFrame.findAll(n => String(n.type) === 'Text')[0]!;
    assert.equal(style(searchGlyph).fontSize, 21);
    assert.equal(style(searchGlyph).lineHeight, 21);
    const searchText = pill.findAll(n => n.props.children === '¿A dónde vamos?' && String(n.type) === 'Text')[0]!;
    assert.equal(style(searchText).fontSize, 16);
    assert.equal(style(searchText).top, undefined);
    assert.equal(style(searchText).transform, undefined);
    assert.equal(restingStyle(pill).borderColor, '#00D68F');
    assert.ok(restingStyle(pill).boxShadow.length > 0);
    assert.deepEqual(Object.assign({}, ...pill.props.style({ pressed: true }).filter(Boolean)).boxShadow, []);
    assert.equal(Object.assign({}, ...pill.props.style({ pressed: true }).filter(Boolean)).justifyContent, 'flex-start');
    assert.equal(Object.assign({}, ...pill.props.style({ pressed: true }).filter(Boolean)).paddingHorizontal, 24);
    assert.equal(style(host(tree, 'SheetBoundary')).backgroundColor, 'transparent');
    assertDetachedSurface(tree);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).borderTopLeftRadius, undefined);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).borderTopRightRadius, undefined);
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
    await act(async () => input.props.onChangeText('Plaza')); await settle();
    assert.equal(style(id(tree, 'passenger-search-field')).borderColor, '#00826F');
    await act(async () => input.props.onBlur());
    await act(async () => input.props.onChangeText('Plaz')); await settle();
    assert.equal(style(id(tree, 'passenger-search-field')).borderColor, '#00D68F');
    assert.ok(id(tree, 'passenger-active-search-glow'));
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
    assert.deepEqual([h.animations.at(-1).value, h.animations.at(-1).duration], [0.97, 110]);
    await act(async () => rows[0]!.props.onPressOut());
    assert.ok(h.animations.length > before);
    assert.ok(h.delays.includes(28));
    assert.equal(fieldHeight, 52);
    assert.ok(id(tree, 'passenger-active-search-glow'));
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-home-search-glow').length, 0);
    assert.equal(h.repeats.length, 0);
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
    assertDetachedSurface(tree);
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

test('Search animates only the first five unseen canonical places, never details updates or rerenders', async () => {
  for (const reduced of [false, true]) {
    const fixture = createPassengerFixtureGateway(clock); const h = createHarness({}, { reduced });
    const initial = Array.from({ length: 7 }, (_, index) => ({ ...fixturePlaces[0]!, id: `result-${index}`,
      canonicalId: index === 2 ? undefined : `canonical-${index}`, name: `Lugar ${index}`, address: `Calle ${index}` }));
    let offered = initial;
    const tree: ReactTestRenderer = await h.render({ ...fixture.gateway, recentPlaces: async () => [],
      findPlaces: async () => offered });
    const rows = () => tree.root.findAll(n => typeof n.type === 'function' && n.type.name === 'PlaceRow' && n.props.exit);
    try {
      await settle(); await press(tree, '¿A dónde vamos?');
      const input = host(tree, 'TextInput');
      await act(async () => input.props.onChangeText('zz')); await settle();
      const scenePresence = id(tree, 'passenger-phase-presence');
      assert.equal(rows().length, 7);
      assert.deepEqual(rows().map(row => row.props.animateEntry), [true, true, true, true, true, false, false]);
      assert.deepEqual(rows().slice(0, 5).map(row => row.props.staggerIndex), [0, 1, 2, 3, 4]);
      const firstPresence = rows()[0]!.find(n => typeof n.type === 'function' && n.type.name === 'ElementEntrance');
      assert.equal(firstPresence.props.distance, 9);
      assert.equal(firstPresence.props.timing.duration, 180);
      if (reduced) assert.deepEqual(style(firstPresence.findByType('AnimatedView' as never)).transform, [{ translateY: 0 }]);
      if (reduced) assert.equal(h.delays.length, 0);
      else for (const delay of [28, 56, 84, 112]) assert.ok(h.delays.includes(delay));
      assert.ok(h.animations.some((a: { value: number; duration: number }) => a.value === 1 && a.duration === 180));
      const listEnters = h.animations.filter((a: { value: number; duration: number }) => a.value === 1 && a.duration === 180).length;
      await act(async () => input.props.onFocus());
      assert.equal(rows().every(row => !row.props.animateEntry), true);
      assert.equal(h.animations.filter((a: { value: number; duration: number }) => a.value === 1 && a.duration === 180).length,
        listEnters);
      offered = [{ ...initial[0]!, id: 'provider-details-update', name: 'Lugar 0 actualizado' },
        ...initial.slice(1).map(place => place.id === 'result-2' ? { ...place, canonicalId: 'canonical-2' } : place),
        { ...fixturePlaces[0]!, id: 'new-result', canonicalId: 'canonical-new', name: 'Lugar nuevo', address: 'Calle nueva' }];
      await act(async () => input.props.onChangeText('zzz')); await settle();
      assert.equal(id(tree, 'passenger-phase-presence'), scenePresence);
      assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
      assert.equal(rows().length, 8);
      assert.equal(rows().find(row => row.props.place.canonicalId === 'canonical-0')?.props.place.id, 'provider-details-update');
      assert.equal(rows().find(row => row.props.place.canonicalId === 'canonical-0')?.props.animateEntry, false);
      assert.equal(rows().find(row => row.props.place.canonicalId === 'canonical-2')?.props.animateEntry, false);
      assert.equal(rows().filter(row => row.props.animateEntry).length, 1);
      assert.equal(rows().find(row => row.props.place.canonicalId === 'canonical-new')?.props.staggerIndex, 0);
      assert.equal(rows().find(row => row.props.place.canonicalId === 'canonical-new')?.props.animateEntry, true);
    } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
  }
});

test('Reduced Motion keeps permanent green borders and stationary halos in Home and Search', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness({}, { reduced: true });
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle();
    assert.equal(restingStyle(id(tree, 'passenger-home-search')).borderColor, '#00D68F');
    assert.equal(style(id(tree, 'passenger-home-search-glow')).opacity, 0.18);
    await press(tree, '¿A dónde vamos?');
    assert.equal(style(id(tree, 'passenger-search-field')).borderColor, '#00D68F');
    assert.equal(style(id(tree, 'passenger-active-search-glow')).opacity, 0.20);
    assert.equal(h.repeats.length, 0);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('review and confirmation put one green address panel first in the sheet content', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  const checkAddresses = () => {
    const frame = id(tree, 'passenger-address-frame');
    const halo = id(tree, 'passenger-address-halo');
    const panel = id(tree, 'passenger-address-panel');
    const origin = id(tree, 'passenger-origin-row');
    const destination = id(tree, 'passenger-destination-row');
    assert.equal(panel.findAll(n => n.props.testID === 'passenger-origin-row').length, 1);
    assert.equal(panel.findAll(n => n.props.testID === 'passenger-destination-row').length, 1);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-address-panel').length, 1);
    const content = id(tree, 'passenger-sheet-content');
    assert.equal(id(tree, 'passenger-sheet-header').findAll(n => n.props.testID === 'passenger-address-panel').length, 0);
    assert.equal(content.findAll(n => n.props.testID === 'passenger-address-panel').length, 1);
    assert.equal(content.findAll(n => n.props.testID === 'passenger-address-frame')[0], frame);
    assert.equal(tree.root.findAll(n => ['passenger-floating-accessory', 'passenger-accessory-gap',
      'passenger-panel-background'].includes(n.props.testID)).length, 0);
    assert.equal(panel.findAll(n => n.props.testID === 'passenger-address-divider').length, 1);
    assert.equal(style(panel).backgroundColor, '#FFFFFF');
    assert.equal(style(panel).borderColor, '#00D68F');
    assert.equal(style(panel).borderRadius, 16);
    assert.equal(style(panel).boxShadow, undefined);
    assert.equal(frame.findAll(n => n.props.testID === 'passenger-address-halo').length, 1);
    assert.equal(style(frame).position, 'relative');
    assert.equal(halo.props.pointerEvents, 'none');
    assert.equal(style(halo).position, 'absolute');
    assert.deepEqual([style(halo).top, style(halo).right, style(halo).bottom, style(halo).left], [0, 0, 0, 0]);
    assert.equal(style(halo).borderRadius, style(panel).borderRadius);
    assert.equal(style(halo).opacity, 0.18);
    assert.deepEqual(style(halo).boxShadow, [{ offsetX: 0, offsetY: 0, blurRadius: 16,
      spreadDistance: 4, color: '#00D68F' }]);
    for (const row of [origin, destination]) {
      const s = restingStyle(row);
      assert.equal(s.borderWidth, 0);
      assert.equal(s.borderRadius, 0);
      assert.deepEqual(s.boxShadow, []);
      assert.equal(s.backgroundColor, 'transparent');
      assert.equal(s.minHeight, 46);
      assert.notEqual(row.props.disabled, true);
      assert.equal(typeof row.props.onPress, 'function');
    }
    assert.equal(origin.findAll(n => style(n).backgroundColor === '#00D68F').length >= 1, true);
    assert.equal(destination.findAll(n => style(n).backgroundColor === '#FF3830').length >= 1, true);
    assert.match(origin.props.accessibilityLabel, /^Origen/);
    assert.match(destination.props.accessibilityLabel, /^Destino /);
  };
  try {
    await settle(); await press(tree, '¿A dónde vamos?');
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    checkAddresses();
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 40);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopRightRadius, 40);
    assert.equal(style(host(tree, 'SheetBoundary')).borderBottomLeftRadius ?? 0, 0);
    assert.equal(style(host(tree, 'SheetBoundary')).borderBottomRightRadius ?? 0, 0);
    const reviewOrder = id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-address-frame' ||
      n.props.label === 'Agregar a Favoritos' || n.props.label === 'Confirmar ubicaciones').map(n => n.props.testID ?? n.props.label);
    assert.deepEqual(reviewOrder, ['passenger-address-frame', 'Confirmar ubicaciones']);
    assert.equal(h.repeats.length, 0);
    await press(tree, 'Confirmar ubicaciones'); await settle();
    checkAddresses();
    const confirmOrder = id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-address-frame' ||
      n.props.label === 'Duración' || n.props.label === 'Solicitar viaje').map(n => n.props.testID ?? n.props.label);
    assert.deepEqual(confirmOrder, ['passenger-address-frame', 'Duración', 'Solicitar viaje']);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 40);
    assert.equal(h.repeats.length, 0);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
    await press(tree, 'Solicitar viaje'); await settle();
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, undefined);
    assert.equal(h.repeats.length, 1); // Only matching starts the approved cycle.
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-active-search-glow').length, 0);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('destination Search places its sole input after the handle inside the measured panel', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(); await mapLayout(tree);
    assertDetachedSurface(tree);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).borderBottomLeftRadius, 0);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).borderBottomRightRadius, 0);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).backgroundColor, 'transparent');
    assert.equal(style(id(tree, 'passenger-panel-header')).backgroundColor, undefined);
    assert.equal(style(id(tree, 'passenger-sheet-viewport')).overflow, 'hidden');
    assert.equal(style(host(tree, 'SheetBoundary')).borderBottomLeftRadius, undefined);
    assert.equal(style(host(tree, 'SheetBoundary')).borderBottomRightRadius, undefined);
    await press(tree, '¿A dónde vamos?');
    const header = id(tree, 'passenger-sheet-header');
    assert.equal(header.findAll(n => n.props.children === '¿A dónde vamos?').length, 0);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-search-title-reserve').length, 0);
    assertDetachedSurface(tree);
    assert.equal(style(id(tree, 'passenger-panel-header')).backgroundColor, undefined);
    assert.equal(header.findAll(n => n.props.testID === 'passenger-floating-accessory').length, 0);
    assert.equal(header.findAll(n => n.props.testID === 'passenger-accessory-gap').length, 0);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-destination-search-title').length, 0);
    assert.equal(header.findAll(n => n.props.testID === 'passenger-search-field').length, 1);
    assert.equal(header.findAllByType('TextInput' as never).length, 1);
    assert.equal(id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-search-field').length, 0);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-search-field').length, 1);
    const input = host(tree, 'TextInput');
    assert.equal(input.props.autoFocus, true);
    assert.equal(style(id(tree, 'passenger-search-field')).height, 52);
    assert.equal(style(id(tree, 'passenger-panel-header')).paddingHorizontal, 20);
    assert.equal(style(id(tree, 'passenger-search-field').parent!).alignSelf, 'stretch');
    await act(async () => input.props.onChangeText(fixturePlaces[1]!.name)); await settle();
    assert.ok(id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-search-results').length === 1);
    assert.equal(host(tree, 'SheetBoundary').props.interaction.targetOffset, 84);
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-destination-search-title').length, 0);
    await press(tree, 'Confirmar ubicaciones');
    const confirmation = id(tree, 'passenger-confirmation-pill');
    assert.equal(style(confirmation).height, 40);
    assert.equal(style(confirmation).top, 40);
    assert.equal(style(confirmation).alignSelf, 'center');
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('review, confirmation and requesting measure addresses inside content; later phases remove them', async () => {
  let finishRequest: (() => void) | undefined;
  const requestClock = { after: () => () => {}, delay: () => new Promise<void>(resolve => { finishRequest = resolve; }) };
  const fixture = createPassengerFixtureGateway(requestClock); fixture.controls.setStop(true);
  const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(); await mapLayout(tree);
    await press(tree, '¿A dónde vamos?');
    await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`);
    await settle();
    const reviewingContent = id(tree, 'passenger-sheet-content');
    assert.equal(reviewingContent.findAll(n => n.props.testID === 'passenger-address-panel').length, 1);
    assert.equal(id(tree, 'passenger-sheet-header').findAll(n => n.props.testID === 'passenger-address-panel').length, 0);
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-stop-row').length, 1);
    assert.equal(id(tree, 'passenger-stop-row').props.disabled, true);
    assert.equal(id(tree, 'passenger-stop-row').props.onPress, undefined);
    assert.equal(id(tree, 'passenger-address-panel').findAll(n => n.props.testID === 'passenger-address-divider').length, 2);
    const reviewHeight = await measure(tree, 224, 28);
    assert.equal(reviewHeight, 252); // Address rows and actions are included once in content height.
    await press(tree, 'Confirmar ubicaciones');
    assert.equal(id(tree, 'passenger-sheet-header').findAll(n => n.props.testID === 'passenger-address-panel').length, 0);
    assert.equal(id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-address-panel').length, 1);
    const panel = id(tree, 'passenger-address-panel');
    const stop = id(tree, 'passenger-stop-row');
    assert.equal(stop.props.disabled, true);
    assert.equal(stop.props.onPress, undefined);
    assert.match(stop.props.accessibilityLabel, new RegExp(fixturePlaces[3]!.name));
    assert.equal(panel.findAll(n => n.props.testID === 'passenger-address-divider').length, 2);
    assert.deepEqual(restingStyle(stop).boxShadow, []);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 40);
    const confirmHeight = await measure(tree, 264, 28);
    assert.equal(confirmHeight, 292);
    await press(tree, 'Solicitar viaje');
    assert.equal(id(tree, 'passenger-sheet-header').findAll(n => n.props.testID === 'passenger-address-panel').length, 0);
    assert.equal(id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-address-panel').length, 1);
    assert.equal(id(tree, 'passenger-stop-row').props.disabled, true);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 40);
    const requestingOrder = id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-address-frame' ||
      n.props.label === 'Duración' || n.props.label === 'Solicitar viaje').map(n => n.props.testID ?? n.props.label);
    assert.deepEqual(requestingOrder, ['passenger-address-frame', 'Duración', 'Solicitar viaje']);
    assert.equal(id(tree, 'passenger-phase-presence').props.exiting.durationMs, 240);
    assert.equal(id(tree, 'passenger-panel-header').findAll(n => n.props.children === 'Confirma tu viaje').length, 0);
    assert.ok(finishRequest);
    await act(async () => finishRequest!()); await settle();
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-address-frame').length, 0);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, undefined);
    await act(async () => fixture.controls.advance('assigned')); await settle();
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-address-frame').length, 0);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, undefined);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { finishRequest?.(); await act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('one keyed phase presence uses 12 dp with 240/300 ms and preserves driver-found haptic', async () => {
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
      await settle(); check(240);
      assert.ok(h.animations.some((a: { value: number; duration: number }) => a.value === 1 && a.duration === 240));
      await press(tree, '¿A dónde vamos?'); check(240);
      await press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`); check(240);
      await press(tree, 'Confirmar ubicaciones'); check(240);
      await press(tree, 'Solicitar viaje'); check(300);
      assert.ok(tree.root.findAll(n => n.props.testID === 'passenger-active-search-glow').length === 0);
      await act(async () => fixture.controls.advance('assigned')); await settle(); check(300);
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
      assert.equal(host(tree, 'SheetBoundary').props.interaction.height, 700);
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
      assert.equal(style(logo).height, 35); assert.equal(style(logo).width, 672 * 35 / 200);
      assert.equal(style(logo).position, 'absolute');
      assert.equal(style(logo).left, 0);
      assert.equal(style(chrome).top + style(logo).top, top! + 14);
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
      const search = id(tree, 'passenger-home-search');
      const searchStyle = Object.assign({}, ...search.props.style({ pressed: false }).filter(Boolean));
      assert.equal(searchStyle.height, 58); assert.equal(searchStyle.borderRadius, 24);
      assert.equal(searchStyle.marginHorizontal, undefined);
      assert.equal(style(id(tree, 'passenger-home-search-frame')).alignSelf, 'stretch');
      const panelBackground = id(tree, 'passenger-panel-background');
      assert.equal(style(panelBackground).height, 700);
      assert.equal(style(panelBackground).height, host(tree, 'SheetBoundary').props.interaction.height);
      assert.equal(style(panelBackground).boxShadow, undefined);
      assertDetachedSurface(tree);
      assert.equal(style(id(tree, 'passenger-sheet-viewport')).boxShadow, undefined);
      assert.equal(style(id(tree, 'passenger-sheet-content')).gap, 8);
      const homeText = (label: string) => tree.root.findAll(n => String(n.type) === 'Text' && n.props.children === label)[0]!;
      for (const label of ['¿A dónde vamos?', 'Lugares guardados', 'Viajes recientes']) {
        assert.equal(style(homeText(label)).fontSize, 16);
      }
      assert.equal(tree.root.findAllByType('Pressable' as never).filter(n => ['Casa', 'Trabajo'].includes(n.props.accessibilityLabel)).length, 2);
      assert.equal(tree.root.findAllByType('Pressable' as never).some(n => String(n.props.accessibilityLabel).startsWith('+')), false);
      for (const [label, background, color] of [
        ['Casa', 'rgba(0, 130, 111, 0.06)', '#00826F'],
        ['Trabajo', '#EAF3FF', '#1E6FE8'],
        ['Favoritos', 'rgba(255, 56, 48, 0.06)', '#FF3830'],
      ]) {
        const place = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label)!;
        assert.equal(restingStyle(place).height, 44);
        assert.equal(restingStyle(place).backgroundColor, background);
        assert.equal(place.findAll(n => typeof n.type === 'function' && n.type.name === 'VimaGlyph')[0]!.props.color, color);
      }
      const homeIcon = tree.root.findAll(n => String(n.type) === 'Text' && style(n).fontSize === 20)[0];
      assert.ok(homeIcon);
      assert.equal(style(id(tree, 'passenger-sheet-header')).backgroundColor, undefined);
      assert.equal(style(id(tree, 'passenger-sheet-viewport')).backgroundColor, 'transparent');
      assert.equal(host(tree, 'SheetBoundary').findAll(n => n.props.testID === 'passenger-home-search').length, 1);
      assert.equal(id(tree, 'passenger-sheet-content').findAll(n => n.props.testID === 'passenger-home-search').length, 0);
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
      assert.equal(style(nav).paddingTop, 6);
      assert.equal(style(nav).paddingBottom, Math.max(10, bottom!));
      assert.equal(style(nav).height, 54 + Math.max(10, bottom!));
      const tabs = nav.findAllByType('Pressable' as never);
      assert.deepEqual(tabs.map(n => n.props.accessibilityLabel), ['Inicio', 'Viajes', 'Pagos', 'Perfil']);
      assert.deepEqual(tabs.map(n => n.props.accessibilityState.disabled), [false, true, true, true]);
      assert.deepEqual(tabs.map(n => n.props.accessibilityState.selected), [true, false, false, false]);
      assert.ok(tabs.slice(1).every(n => n.props.onPress === undefined));
      assert.ok(tabs.every(n => restingStyle(n).height >= 44));
      assert.ok(tabs.every(n => restingStyle(n).gap === 2));
      for (const [index, tab] of tabs.entries()) {
        const expected = index === 0 ? '#00826F' : '#2A2E2D';
        assert.ok(tab.findAll(n => style(n).color === expected).length >= 2);
      }
      assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
    } finally { await act(async () => tree.unmount()); fixture.controls.dispose(); }
  }
});

test('Layers closes as one measured surface without flex reflow, stale close or reduced-motion travel', async () => {
  for (const reduced of [false, true]) {
  const h = createHarness({}, { reduced });
  const { MapControls } = h.load('src/features/passenger/MapControls.tsx');
  let toggled = 0;
  function Scene() {
    const [open, setOpen] = React.useState(false);
    return React.createElement(MapControls, {
      available: true, layers: { traffic: false, incidents: false }, open,
      onOpen: () => setOpen(value => !value), onToggle: () => { toggled++; },
      compass: React.createElement('View', { testID: 'compass-marker' }),
    });
  }
  let tree: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(Scene)); });
  try {
    const slot = () => id(tree!, 'passenger-layers-slot');
    const menu = () => id(tree!, 'passenger-layers-menu');
    const button = () => tree!.root.find(n => n.props.accessibilityLabel === 'Capas del mapa');
    const glyph = (codepoint: number) => button().findAll(n => n.type === ('Text' as never) &&
      n.props.children === String.fromCodePoint(codepoint)).length;
    // The host mock evaluates animated styles on render; native Reanimated updates them on the UI thread.
    const press = async () => {
      await act(async () => button().props.onPress());
      await act(async () => tree!.update(React.createElement(Scene)));
    };
    const closeCompletion = () => h.animations.findLast((animation: { value: number; completion?: (finished: boolean) => void }) =>
      animation.value === 0 && animation.completion)?.completion;
    const firstMenu = menu();
    const firstRows = firstMenu.findAll(n => n.props.accessibilityRole === 'switch');
    assert.equal(firstRows.length, 2);
    assert.equal(style(slot()).height, 8);
    assert.equal(menu().props.pointerEvents, 'none');
    assert.equal(menu().props.accessibilityElementsHidden, true);
    assert.equal(glyph(glyphCodepoints.layers), 1);
    await act(async () => menu().props.onLayout({ nativeEvent: { layout: { height: 112 } } }));
    await press();
    assert.equal(style(slot()).height, 128);
    assert.equal(style(menu()).minWidth, 192);
    assert.deepEqual([style(menu()).position, style(menu()).bottom], ['absolute', 8]);
    assert.equal(menu().props.entering, undefined);
    assert.equal(menu().props.exiting, undefined);
    assert.equal(h.animations.findLast((animation: { value: number }) => animation.value === 1)?.duration, 300);
    assert.equal(style(tree!.root.findByType('AnimatedView' as never)).gap, undefined);
    assert.equal(glyph(glyphCodepoints.close), 1);
    assert.equal(menu().props.pointerEvents, 'auto');
    const nodes = tree!.root.findAll(n => typeof n.type === 'string');
    const compass = nodes.findIndex(n => n.props.testID === 'compass-marker');
    const menuIndex = nodes.findIndex(n => n.props.testID === 'passenger-layers-menu');
    const layers = nodes.findIndex(n => n.props.accessibilityLabel === 'Capas del mapa');
    assert.ok(compass >= 0 && compass < menuIndex && menuIndex < layers);
    const incident = nodes.find(n => n.props.children === 'Incidentes');
    assert.equal(incident?.props.numberOfLines, 1);
    await act(async () => firstRows[0]!.props.onPress());
    assert.equal(toggled, 1);
    await press();
    const interruptedClose = closeCompletion();
    assert.ok(interruptedClose);
    assert.equal(menu(), firstMenu);
    assert.equal(menu().findAll(n => n.props.accessibilityRole === 'switch')[0], firstRows[0]);
    assert.equal(menu().findAll(n => n.props.accessibilityRole === 'switch').length, 2);
    assert.equal(style(slot()).height, 8);
    assert.equal(glyph(glyphCodepoints.close), 1);
    assert.equal(menu().props.pointerEvents, 'none');
    assert.equal(menu().props.accessibilityElementsHidden, true);
    assert.equal(style(menu()).transform[0].translateY, reduced ? 0 : -6);
    assert.equal(h.animations.findLast((animation: { value: number; completion?: unknown }) =>
      animation.value === 0 && animation.completion)?.duration, 240);
    await press();
    await act(async () => interruptedClose!(true));
    assert.equal(glyph(glyphCodepoints.close), 1);
    for (let cycle = 0; cycle < 10; cycle++) {
      await press();
      assert.equal(glyph(glyphCodepoints.close), 1);
      const completion = closeCompletion();
      assert.ok(completion);
      await act(async () => completion!(true));
      assert.equal(glyph(glyphCodepoints.layers), 1);
      assert.equal(menu(), firstMenu);
      assert.equal(style(slot()).height, 8);
      assert.equal(menu().props.pointerEvents, 'none');
      if (cycle < 9) await press();
    }
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
  assert.equal(glyphCodepoints.compass, 0xe87a); // Material Symbols explore: compass rose.
  assert.notEqual(glyphCodepoints.compass, 0xe55d); // Previous navigation arrow.
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
      const needle = id(tree, 'passenger-compass-needle');
      assert.equal(style(needle).width, 24); assert.equal(style(needle).height, 24);
      assert.equal(style(id(tree, 'passenger-compass-north')).borderBottomColor, '#FF3830');
      assert.equal(style(id(tree, 'passenger-compass-south')).borderTopColor, '#2A2E2D');
      assert.equal(style(id(tree, 'passenger-compass-north-outline')).borderBottomColor, '#2A2E2D');
      assert.deepEqual(style(needle).transform, [{ rotate: '-90deg' }]);
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

test('only normal Home uses the 50% panel with its search inside the persistent sheet', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(); await mapLayout(tree);
    const homeHeight = await measure(tree, 250, 96);
    assert.equal(homeHeight, 700 * 0.50);
    assert.equal(host(tree, 'SheetBoundary').props.interaction.height, 700);
    assert.ok(Math.abs(homeHeight - 700 * 0.50) < 0.01);
    assert.equal(id(tree, 'passenger-home-search').props.accessibilityLabel, '¿A dónde vamos?');
    assert.equal(id(tree, 'passenger-panel-header').findAll(n => n.props.testID === 'passenger-home-search').length, 1);
    assert.equal(style(host(tree, 'SheetBoundary')).overflow, 'visible');
    const savedLink = tree.root.findAllByType('Pressable' as never).find(n =>
      n.findAll(child => child.props.children === 'Ver todos').length > 0);
    assert.ok(savedLink);
    await act(async () => savedLink.props.onPress());
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-panel-background').length, 0);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopLeftRadius, 40);
    assert.equal(style(host(tree, 'SheetBoundary')).borderTopRightRadius, 40);
    const back = tree.root.findAllByType('Pressable' as never).find(n =>
      n.findAll(child => child.props.children === 'Volver').length > 0);
    assert.ok(back);
    await act(async () => back.props.onPress());
    assertDetachedSurface(tree);
    await press(tree, '¿A dónde vamos?');
    assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-home-search').length, 0);
    assert.equal(style(host(tree, 'SheetBoundary')).overflow, 'visible');
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
    assert.equal(visibleHeight, 350);
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
