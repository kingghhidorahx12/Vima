import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { createRequire } from 'node:module';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { fixturePlaces, fixtureQuote, fixtureAssignment } from '../src/dev/passenger/fixtures.ts';
import { createPassengerFixtureGateway } from '../src/dev/passenger/gateway.ts';
import type { PassengerTrip } from '../src/features/passenger/model.ts';
import { priceTrip } from '../gateway/pricing/engine.ts';
import { syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';
const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const quote = fixtureQuote({ origin: fixturePlaces[0]!, destination: fixturePlaces[1]!, stops: [] });
const assignment = fixtureAssignment(quote, 1);
const base: PassengerTrip = { id: 'visual-trip', revision: 1, phase: 'assigned', requestState: 'ASSIGNED', quote, assignment };
const text = (tree: ReactTestRenderer) => tree.root.findAllByType('Text' as never).map(n => n.props.children).flat().join('');
const press = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === label)!;

test('D1 Passenger shows unknown Driver rating honestly in light/dark and preserves numeric historical ratings', async () => {
  for (const themeName of ['light', 'dark']) {
    const f = createPassengerFixtureGateway({ after: () => () => {}, delay: async () => {} });
    let current: PassengerTrip = { ...base, assignment: { ...assignment, driver: { name: assignment.driver.name, rating: null, ratingCount: 0 } } };
    const h = createHarness({}, { themeName, reduced: true });
    const tree: ReactTestRenderer = await h.render({ ...f.gateway, source: 'server', activeRequest: async () => current, fetch: async () => current });
    try {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      assert.ok(text(tree).includes('Sin valoraciones'));
      current = { ...current, revision: 2, assignment: { ...assignment, driver: { name: assignment.driver.name, rating: 4.9 } } };
      await act(async () => { await h.client.invalidateQueries({ queryKey: ['trip'] }); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
      assert.equal(text(tree).includes('Sin valoraciones'), false);
      assert.ok(text(tree).includes('4.9'));
      assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
    } finally { await act(async () => tree.unmount()); h.client.clear(); f.controls.dispose(); }
  }
});

test('destination summary uses real name/address and semantic media fallback without a second selection', async () => {
  const h = createHarness(); const { DestinationSummary } = h.load('src/features/passenger/PassengerJourneySummary.tsx');
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(DestinationSummary, { place: quote.destination })); });
  try {
    assert.ok(text(tree).includes(quote.destination.name)); assert.ok(text(tree).includes(quote.destination.address));
    assert.equal(tree.root.findAllByType('ExpoImage' as never).length, 0);
    assert.equal(tree.root.findAllByType('Pressable' as never).length, 0);
  } finally { await act(async () => tree.unmount()); }
});

test('completion uses settlement meter and total, never estimated quote metrics or invented rating actions, in both themes', async () => {
  const price = priceTrip({ config: syntheticPricing(), profile: 'URBANO', routeMetrics: syntheticRoute }).price;
  const trip: PassengerTrip = { ...base, phase: 'completed', requestState: 'COMPLETED', lifecycle: { completedStops: 0, incurredAdditionCodes: [], settlement: {
    kind: 'normal', assignmentId: assignment.id, createdAt: Date.now(), finalTelemetrySequence: 1,
    metrics: { lastSequence: 1, distanceMeters: 0, durationSeconds: 60 }, incurredAdditionCodes: [], price,
    pricingBasisId: 'test', configVersion: 'test', profile: 'URBANO' } } };
  for (const themeName of ['light', 'dark']) {
    const h = createHarness({}, { themeName, reduced: true }); const { JourneyClosure } = h.load('src/features/passenger/PassengerJourneySummary.tsx');
    let home = 0; let tree!: ReactTestRenderer;
    await act(async () => { tree = create(React.createElement(JourneyClosure, { trip, onHome: () => home++ })); });
    try {
      assert.ok(text(tree).includes('0 km confirmados')); assert.ok(text(tree).includes('Total en efectivo'));
      assert.equal(text(tree).includes(`${quote.distanceKm} km`), false);
      assert.equal(tree.root.findAllByProps({ accessibilityLabel: 'Calificar viaje' }).length, 0);
      await act(async () => press(tree, 'Volver al inicio').props.onPress()); assert.equal(home, 1);
      await act(async () => tree.update(React.createElement(JourneyClosure, { trip: { ...trip, lifecycle: undefined }, onHome() {} })));
      assert.equal(tree.root.findAllByProps({ testID: 'passenger-settlement-summary' }).length, 0);
    } finally { await act(async () => tree.unmount()); }
  }
});

test('assigned, arrival, in progress and completion revisions preserve shell/map and gate pre-PIN actions', async () => {
  const f = createPassengerFixtureGateway({ after: () => () => {}, delay: async () => {} });
  let current = base; const h = createHarness();
  const tree: ReactTestRenderer = await h.render({ ...f.gateway, source: 'server', activeRequest: async () => current, fetch: async () => current });
  try {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.ok(text(tree).includes('Tiempo estimado de recogida:'));
    assert.ok(tree.root.findAllByProps({ accessibilityLabel: 'PIN 4 8 2 6' }).length);
    assert.equal(press(tree, 'Llamar').props.disabled, true); assert.equal(press(tree, 'Seguridad').props.disabled, true);
    for (const state of ['ARRIVED_PICKUP', 'IN_PROGRESS', 'PAYMENT_PENDING', 'COMPLETED'] as const) {
      current = { ...current, revision: current.revision + 1, requestState: state, phase: state === 'COMPLETED' ? 'completed' : 'assigned' };
      await act(async () => { await h.client.invalidateQueries({ queryKey: ['trip'] }); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
      if (state === 'ARRIVED_PICKUP') assert.ok(text(tree).includes('Tu conductor llegó'));
      else assert.equal(tree.root.findAllByProps({ accessibilityLabel: 'PIN 4 8 2 6' }).length, 0);
      if (state === 'IN_PROGRESS') { assert.ok(text(tree).includes('Viaje en curso')); assert.equal(press(tree, 'Cancelar viaje').props.disabled, true); }
      if (state === 'COMPLETED') {
        assert.ok(tree.root.findByProps({ testID: 'passenger-journey-closure' }));
        assert.equal(tree.root.findAllByProps({ accessibilityLabel: 'Cancelar viaje' }).length, 0);
      }
    }
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { await act(async () => tree.unmount()); h.client.clear(); f.controls.dispose(); }
});
