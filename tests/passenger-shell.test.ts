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
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
async function press(tree: ReactTestRenderer, label: string) {
  const node = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label && n.props.onPress);
  assert.ok(node, label); assert.ok(!node.props.disabled);
  await act(async () => node.props.onPress()); await settle();
}
async function mapLayout(tree: ReactTestRenderer, height = 700) {
  await act(async () => id(tree, 'passenger-map-surface').props.onLayout({ nativeEvent: { layout: { width: 390, height } } }));
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

test('status bar and 4 dp gap precede the clipped inset map, while sheet and nav remain full width', async () => {
  for (const [top, bottom] of [[0, 0], [24, 16], [48, 34]]) {
    const h = createHarness({}, { insets: { top, bottom, left: 0, right: 0 } });
    const fixture = createPassengerFixtureGateway(clock); const tree: ReactTestRenderer = await h.render(fixture.gateway);
    try {
      await settle();
      assert.equal(style(id(tree, 'passenger-root')).backgroundColor, '#F6F7F8');
      assert.equal(tree.root.findAllByType('SafeAreaView' as never).length, 0);
      assert.equal(host(tree, 'StatusBar').props.style, 'light');
      assert.equal(style(id(tree, 'passenger-map-top-gap')).height, top! + 4);
      assert.equal(style(id(tree, 'passenger-status-surface')).height, top);
      assert.equal(style(id(tree, 'passenger-status-surface')).backgroundColor, '#0B0F0E');
      const surface = id(tree, 'passenger-map-surface');
      assert.equal(style(surface).marginHorizontal, undefined);
      assert.equal(style(surface).overflow, undefined);
      assert.equal(surface.props.collapsable, false);
      const mapViewport = surface.findAllByType('View' as never).find(n => style(n).marginHorizontal === 4);
      assert.ok(mapViewport);
      assert.equal(mapViewport!.props.collapsable, false);
      assert.equal(style(mapViewport!).borderTopLeftRadius, 24); assert.equal(style(mapViewport!).borderTopRightRadius, 24);
      assert.equal(style(mapViewport!).overflow, 'hidden'); assert.equal(style(mapViewport!).borderWidth, undefined);
      assert.equal(mapViewport!.findAllByType('NativeMapBoundary' as never).length, 1);
      assert.equal(mapViewport!.findAllByType('SheetBoundary' as never).length, 0);
      assert.equal(style(host(tree, 'SheetBoundary')).marginHorizontal, undefined);
      const chrome = id(tree, 'passenger-top-chrome');
      assert.equal(style(chrome).position, 'absolute'); assert.equal(style(chrome).top, 8);
      assert.equal(style(chrome).left, 16); assert.equal(style(chrome).backgroundColor, undefined);
      assert.equal(host(tree, 'PassengerMapContent').props.topOcclusion, 68);
      assert.equal(tree.root.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 0);
      const logo = chrome.findByType('Image' as never);
      assert.match(logo.props.source, /vima_header_lockup_final\.png$/);
      assert.equal(style(logo).height, 28); assert.equal(style(logo).backgroundColor, undefined);
      const notifications = chrome.findByType('Pressable' as never);
      assert.equal(notifications.props.accessibilityLabel, 'Notificaciones');
      assert.equal(notifications.props.accessibilityState.disabled, true); assert.equal(notifications.props.onPress, undefined);
      assert.equal(style(notifications).width, 40); assert.equal(style(notifications).height, 40);
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
      assert.equal(pillStyle.top, 12);
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
      assert.equal(surface.findAll(n => n.props.testID === 'passenger-confirmation-pill').length, 1);
      assert.equal(hasNav(tree), false);
      assert.equal(style(id(tree, 'passenger-sheet-content')).paddingBottom, 54);
      assert.equal(host(tree, 'PassengerMapContent').props.topOcclusion, 68);
      assert.equal(style(id(tree, 'passenger-map-top-gap')).height, top + 4);
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
