import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { usePassengerRouteFit, passengerRouteSafetyMargin } from '../src/features/passenger/usePassengerRouteFit.ts';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';

const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const quote = fixtureQuote({ origin: fixturePlaces[0]!, destination: fixturePlaces[1]!, stops: [] });
type Props = Parameters<typeof usePassengerRouteFit>[0];
const initial: Props = { quote, origin: quote.origin, destination: quote.destination, reviewing: false, confirming: true,
  phase: 'confirm', confirmationRequest: 1, searchActive: false, ready: true, measuredSheetHeight: 360,
  viewport: { width: 390, height: 820, topOcclusion: 96 } };

test('route intents follow settled CONFIRM/requesting/MATCHING geometry, then wait for explicit recenter after a pan', async () => {
  let props = { ...initial }; let tree!: ReactTestRenderer;
  const Probe = (value: Props) => React.createElement('fit', { intent: usePassengerRouteFit(value) });
  await act(async () => { tree = create(React.createElement(Probe, props)); });
  const fit = () => tree.root.findByType('fit' as never).props.intent;
  const update = async (patch: Partial<Props>) => { props = { ...props, ...patch }; await act(async () => tree.update(React.createElement(Probe, props))); };
  try {
    const confirm = fit(); assert.equal(confirm.sheetHeight, 360);
    assert.equal(confirm.confirmationBottomPadding, 28); assert.equal(confirm.safetyMargin, 28);
    await update({ quote: { ...quote } }); assert.equal(fit(), confirm);
    await update({ phase: 'requesting', measuredSheetHeight: undefined }); assert.equal(fit(), undefined);
    await update({ measuredSheetHeight: 380 }); const requesting = fit(); assert.ok(requesting.sequence > confirm.sequence);
    await update({ phase: 'searching', confirming: false, matching: true, measuredSheetHeight: undefined });
    assert.equal(fit(), undefined);
    await update({ measuredSheetHeight: 300 }); const matching = fit(); assert.ok(matching.sequence > requesting.sequence);
    assert.equal(matching.confirmationBottomPadding, 0); assert.equal(matching.safetyMargin, passengerRouteSafetyMargin);
    await update({ measuredSheetHeight: 300.1 }); assert.equal(fit(), matching); // Same rounded native geometry.
    await update({ measuredSheetHeight: 340 }); const resized = fit(); assert.ok(resized.sequence > matching.sequence);
    await update({ viewport: { ...initial.viewport!, topOcclusion: 120 } }); const top = fit(); assert.ok(top.sequence > resized.sequence);
    await update({ viewport: { width: 820, height: 390, topOcclusion: 60 }, measuredSheetHeight: 180 });
    const rotated = fit(); assert.ok(rotated.sequence > top.sequence);
    await update({}); assert.equal(fit(), rotated);
    await update({ userControlled: true }); assert.equal(fit(), undefined);
    await update({ measuredSheetHeight: 190, phase: 'expanding' }); assert.equal(fit(), undefined);
    await update({ userControlled: false, recenterRequest: 1 }); const recentered = fit();
    assert.ok(recentered.sequence > rotated.sequence); assert.equal(recentered.sheetHeight, 190);
    await update({}); assert.equal(fit(), recentered);
    await update({ searchActive: true, quote: { ...quote, id: 'late-quote' } }); assert.equal(fit(), undefined);
    await update({ searchActive: false, destination: fixturePlaces[2]! }); assert.equal(fit(), undefined);
  } finally { await act(async () => tree.unmount()); }
});

test('native Passenger fits keep full geometry and 28 dp outside pin artwork, without generic camera overwrite or GPS refits', async () => {
  for (const reduced of [false, true]) {
    const h = createMapHarness({ reduced });
    const { PassengerMap } = h.load('src/features/passenger/PassengerMap.tsx');
    const { passengerPinClearance, mapControlSize } = h.load('src/features/passenger/mapCameraFootprint.ts');
    const { visualTokens: tokens } = h.load('src/design/tokens/index.ts');
    const coordinates = [[-99.9, 19.8], [-100, 20.2], [-99.6, 20.4], [-99.5, 20]];
    const origin = { ...quote.origin, coordinate: coordinates[0] as [number, number] };
    const destination = { ...quote.destination, coordinate: coordinates[3] as [number, number] };
    const current = { ...quote, origin, destination, route: { ...quote.route, geometry: { type: 'LineString' as const, coordinates } } };
    const config = { viewport: () => ({ coordinates: [origin.coordinate, destination.coordinate], padding: { top: 24, left: 16, right: 16, bottom: 0 } }),
      route: { width: 4, opacity: 1 }, vehicle: { radius: 12, color: '#000' } };
    const Scene = ({ sheetHeight = 360, measuredSheetHeight = 360, userControlled = false, recenterRequest = 0,
      phase = 'confirm', confirming = true, matching = false, topOcclusion = 96, gps = 0 }) => {
      const fit = usePassengerRouteFit({ ...initial, quote: current, origin, destination, confirming, matching, phase,
        measuredSheetHeight, userControlled, recenterRequest, viewport: { width: 390, height: 820, topOcclusion } });
      return React.createElement(PassengerMap, { quote: current, origin, destination, home: false, ready: true, sheetHeight,
        topOcclusion, cameraMode: 'user-controlled', fitRoute: fit, config,
        currentLocation: { ...origin, coordinate: [origin.coordinate[0] + gps, origin.coordinate[1]] } });
    };
    const tree: ReactTestRenderer = await h.render(React.createElement(Scene));
    const stops = () => h.calls.filter((call: unknown[]) => call[0] === 'setStop').map((call: unknown[]) => call[1]);
    try {
      assert.equal(stops().length, 1);
      const first = stops()[0];
      assert.deepEqual(first.bounds, [-100, 19.8, -99.5, 20.4]);
      assert.equal(first.padding.top, 96 + passengerPinClearance.top + 28);
      assert.equal(first.padding.bottom, 360 + passengerPinClearance.bottom + 28 + 28);
      assert.equal(first.padding.left, passengerPinClearance.side + 28);
      assert.equal(first.padding.right, tokens.spacing.mobileHorizontalMarginPx + mapControlSize + passengerPinClearance.side + 28);
      assert.equal(first.duration, reduced ? 0 : 420);
      await h.act(async () => tree.update(React.createElement(Scene, { sheetHeight: 500, gps: 0.00001 })));
      assert.equal(stops().length, 1); // New generic target cannot undo the measured fit.
      await h.act(async () => tree.update(React.createElement(Scene, { phase: 'searching', confirming: false, matching: true, measuredSheetHeight: 300 })));
      assert.equal(stops().length, 2);
      assert.equal(stops()[1].padding.bottom, 300 + passengerPinClearance.bottom + 28);
      await h.act(async () => tree.update(React.createElement(Scene, { userControlled: true, measuredSheetHeight: 400 })));
      assert.equal(stops().length, 2);
      await h.act(async () => tree.update(React.createElement(Scene, { recenterRequest: 1, measuredSheetHeight: 400 })));
      assert.equal(stops().length, 3); assert.ok(stops()[2].bounds);
      await h.act(async () => tree.update(React.createElement(Scene, { recenterRequest: 1, measuredSheetHeight: 800 })));
      assert.equal(stops().length, 3); // Never submit padding larger than the viewport.
      await h.act(async () => tree.update(React.createElement(Scene, { recenterRequest: 1, measuredSheetHeight: 300 })));
      assert.equal(stops().length, 4); // A usable settled viewport recovers without remount.
      assert.equal(h.calls.filter((call: unknown[]) => call[0] === 'mount' && call[1] === 'MapLibreCamera').length, 1);
    } finally { await h.act(async () => tree.unmount()); }
  }
});
