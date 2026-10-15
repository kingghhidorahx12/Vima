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

test('a phase label alone cannot refit identical route and occupied viewport', async () => {
  const Probe = (props: Props) => React.createElement('fit', { intent: usePassengerRouteFit(props) });
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(Probe, initial)); });
  const fit = () => tree.root.findByType('fit' as never).props.intent;
  try {
    const first = fit();
    await act(async () => tree.update(React.createElement(Probe, { ...initial, phase: 'requesting' })));
    assert.equal(fit().sequence, first.sequence);
    await act(async () => tree.update(React.createElement(Probe, { ...initial, phase: 'searching', matching: true, confirming: false })));
    assert.equal(fit().sequence, first.sequence);
    await act(async () => tree.update(React.createElement(Probe, { ...initial, phase: 'expanding', matching: true, confirming: false })));
    assert.equal(fit().sequence, first.sequence);
  } finally { await act(async () => tree.unmount()); }
});

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

test('native Passenger fits keep full geometry with one clearance per edge, without generic camera overwrite or GPS refits', async () => {
  // Camera-only synthetic shapes: short urban and longer winding journeys.
  // These are never provider routes or coordinates offered by the product.
  for (const { coordinates, bounds } of [
    { coordinates: [[-99.89, 19.80], [-99.885, 19.799], [-99.88795, 19.79021]], bounds: [-99.89, 19.79021, -99.885, 19.80] },
    { coordinates: [[-99.91, 19.82], [-99.90, 19.79], [-99.86, 19.77], [-99.85, 19.75]], bounds: [-99.91, 19.75, -99.85, 19.82] },
  ]) {
  for (const reduced of [false, true]) {
    const h = createMapHarness({ reduced });
    const { PassengerMap } = h.load('src/features/passenger/PassengerMap.tsx');
    const { passengerPinClearance, mapControlSize } = h.load('src/features/passenger/mapCameraFootprint.ts');
    const { visualTokens: tokens } = h.load('src/design/tokens/index.ts');
    const origin = { ...quote.origin, coordinate: coordinates[0] as [number, number] };
    const destination = { ...quote.destination, coordinate: coordinates.at(-1) as [number, number] };
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
      assert.equal(first.bounds.length, bounds.length);
      first.bounds.forEach((value: number, index: number) => assert.ok(Math.abs(value - bounds[index]!) < 1e-10));
      assert.equal(first.padding.top, 96 + Math.max(passengerPinClearance.top, 28));
      assert.equal(first.padding.bottom, 360 + 28);
      assert.equal(first.padding.left, 28);
      assert.equal(first.padding.right, tokens.spacing.mobileHorizontalMarginPx + mapControlSize + 28);
      assert.equal(first.zoom, undefined); // Native bounds fitting chooses the maximum useful scale, never a fixed zoom.
      assert.equal(first.duration, reduced ? 0 : 420);
      await h.act(async () => tree.update(React.createElement(Scene, { sheetHeight: 500, gps: 0.00001 })));
      assert.equal(stops().length, 1); // New generic target cannot undo the measured fit.
      await h.act(async () => tree.update(React.createElement(Scene, { phase: 'requesting' })));
      assert.equal(stops().length, 1);
      await h.act(async () => tree.update(React.createElement(Scene, { phase: 'searching', confirming: false, matching: true })));
      assert.equal(stops().length, 1); // Same padding, not a second zoom for the state label.
      await h.act(async () => tree.update(React.createElement(Scene, { phase: 'searching', confirming: false, matching: true, measuredSheetHeight: 300 })));
      assert.equal(stops().length, 2);
      assert.equal(stops()[1].padding.bottom, 300 + 28);
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
  }
});
