import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import { createRequire } from 'node:module';
import { createPassengerFixtureGateway } from '../src/dev/passenger/gateway.ts';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';
import type { PassengerGateway, Place, RideDraft } from '../src/features/passenger/model.ts';
import type { usePassengerFlow } from '../src/features/passenger/usePassengerFlow.ts';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
const tick = () => act(async () => { await new Promise(r => setTimeout(r, 15)); });
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const origin = fixturePlaces[0]!;
const north = (m: number) => [origin.coordinate[0], origin.coordinate[1] + m / 6371000 * 180 / Math.PI] as const;
const clock = { after: () => () => {}, delay: async () => {} };
async function probe(overrides: Partial<PassengerGateway> = {}) {
  const f = createPassengerFixtureGateway(clock); const h = createHarness(); let flow!: ReturnType<typeof usePassengerFlow>;
  const gateway = { ...f.gateway, ...overrides }; const hook = h.load('src/features/passenger/usePassengerFlow.ts').usePassengerFlow;
  function Probe() { flow = hook(gateway); return null; }
  let tree!: ReactTestRenderer;
  await act(async () => { tree = create(React.createElement(h.QueryClientProvider, { client: h.client }, React.createElement(Probe))); });
  await tick();
  return { get flow() { return flow; }, async close() { await act(async () => tree.unmount()); h.client.clear(); f.controls.dispose(); } };
}

test('A pending pickup never changes quote; 201m rejected, 200m confirmed invalidates quote and keeps effective/reference distinct', async () => {
  const drafts: RideDraft[] = [];
  const p = await probe({ locate: async () => origin, reversePlace: async coordinate => ({ ...origin, coordinate, address: 'Calle de prueba' }),
    quote: async draft => { drafts.push(draft); return { ...fixtureQuote(draft), id: `pickup-quote-${drafts.length}` }; } });
  try {
    await act(async () => { await p.flow.choosePlace(fixturePlaces[1]!, 'destination'); }); await tick();
    const oldQuote = p.flow.quote; assert.equal(drafts.length, 1);
    await act(async () => p.flow.beginPickup(true));
    assert.equal(p.flow.canSubmit, false);
    await act(async () => p.flow.previewPickup(north(201)));
    await act(async () => assert.equal(p.flow.confirmPickup(), false));
    assert.equal(p.flow.quote, oldQuote); assert.equal(drafts.length, 1);
    await act(async () => p.flow.previewPickup(north(200)));
    await act(async () => assert.equal(p.flow.confirmPickup(), true)); await tick();
    assert.equal(drafts.length, 2); assert.notEqual(p.flow.quote?.id, oldQuote?.id);
    assert.deepEqual(p.flow.quote?.origin.coordinate, north(200)); assert.deepEqual(p.flow.quote?.referenceOrigin, origin);
    await act(async () => p.flow.beginPickup(true));
    await act(async () => p.flow.previewPickup(origin.coordinate));
    await act(async () => assert.equal(p.flow.confirmPickup(), true)); await tick();
    assert.equal(p.flow.quote?.referenceOrigin, undefined);
  } finally { await p.close(); }
});

test('A free origin is not limited by 200m; late GPS and reverse cannot overwrite confirmed/cancelled selections', async () => {
  let gps!: (p: Place) => void; let reverse!: (p: Place) => void;
  const p = await probe({ locate: () => new Promise(r => { gps = r; }), reversePlace: () => new Promise(r => { reverse = r; }) });
  try {
    await act(async () => p.flow.choosePlace({ ...origin, id: 'free-origin', coordinate: north(900) }, 'origin'));
    await act(async () => gps(origin));
    assert.deepEqual(p.flow.origin?.coordinate, north(900));
    await act(async () => p.flow.beginPickup(false));
    let pending!: Promise<void>;
    await act(async () => { pending = p.flow.previewPickup(north(1200)); });
    assert.equal(p.flow.pickup?.reference, undefined);
    await act(async () => p.flow.movePickup());
    await act(async () => { reverse({ ...origin, coordinate: north(1200) }); await pending; });
    assert.equal(p.flow.pickup?.moving, true);
    await act(async () => p.flow.cancelPickup());
    assert.equal(p.flow.pickup, undefined); assert.deepEqual(p.flow.origin?.coordinate, north(900));
  } finally { await p.close(); }
});

test('A no mapped address allows honest manual reference, never changes coordinate or fabricates a road', async () => {
  const p = await probe({ locate: async () => origin, reversePlace: async () => { throw Error('no roads'); } });
  try {
    await act(async () => p.flow.beginPickup(false));
    await act(async () => p.flow.previewPickup(north(800)));
    assert.equal(p.flow.pickup?.reverseFailed, true);
    await act(async () => assert.equal(p.flow.confirmPickup(), false));
    await act(async () => p.flow.setPickupReference('Portón azul de la comunidad'));
    await act(async () => assert.equal(p.flow.confirmPickup(), true));
    assert.deepEqual(p.flow.origin?.coordinate, north(800));
    assert.equal(p.flow.origin?.name, 'Referencia manual'); assert.equal(p.flow.origin?.address, 'Portón azul de la comunidad');
    assert.equal(p.flow.referenceOrigin, undefined);
  } finally { await p.close(); }
});

test('A manual access description keeps an existing address; configurable UI radius follows server session', async () => {
  const p = await probe({ pickupAdjustmentMaxMeters: 100, locate: async () => origin,
    reversePlace: async coordinate => ({ ...origin, coordinate, address:'Calle conocida 20' }) });
  try {
    await act(async () => p.flow.beginPickup(true));
    await act(async () => p.flow.previewPickup(north(199)));
    await act(async () => assert.equal(p.flow.confirmPickup(), false));
    await act(async () => p.flow.previewPickup(north(99)));
    await act(async () => p.flow.setPickupReference('Entrada por el portón'));
    await act(async () => assert.equal(p.flow.confirmPickup(), true));
    assert.equal(p.flow.origin?.address, 'Calle conocida 20');
    assert.equal(p.flow.origin?.name, 'Referencia: Entrada por el portón');
  } finally { await p.close(); }
});

test('A cancellation/restoration keeps reference; selecting another origin resets it while destination edits preserve it', async () => {
  const p = await probe({ locate: async () => origin, reversePlace: async coordinate => ({ ...origin, coordinate }) });
  try {
    await act(async () => p.flow.choosePlace(fixturePlaces[1]!, 'destination')); await tick();
    await act(async () => p.flow.beginPickup(true));
    await act(async () => p.flow.previewPickup(north(100)));
    await act(async () => { p.flow.confirmPickup(); }); await tick();
    await act(async () => { await p.flow.submit(); }); await tick();
    assert.equal(p.flow.phase, 'searching');
    await act(async () => { await p.flow.act('cancel'); }); await tick();
    assert.deepEqual(p.flow.quote?.referenceOrigin, origin);
    await act(async () => p.flow.choosePlace(fixturePlaces[2]!, 'destination')); await tick();
    assert.deepEqual(p.flow.quote?.referenceOrigin, origin);
    await act(async () => p.flow.choosePlace(fixturePlaces[0]!, 'origin')); await tick();
    assert.equal(p.flow.referenceOrigin, undefined);
  } finally { await p.close(); }
});

for (const themeName of ['light', 'dark']) test(`A centered pin only captures settled camera; no taps/intermediate captures, ${themeName}/ReducedMotion`, async () => {
  const f = createPassengerFixtureGateway(clock); const h = createHarness({}, { reduced: true, themeName });
  let reverses = 0; let pixel: number[] | undefined;
  const gateway = { ...f.gateway, locate: async () => origin, reversePlace: async (coordinate: Place['coordinate']) => { reverses++; return { ...origin, coordinate }; } };
  const tree: ReactTestRenderer = await h.render(gateway);
  const press = (label: string) => {
    const n = tree.root.findAll(n => String(n.type) === 'Pressable' && n.props.accessibilityLabel === label)[0]!;
    assert.ok(n, label); assert.equal(!!n.props.disabled, false, label); n.props.onPress();
  };
  try {
    await tick();
    await act(async () => tree.root.findByProps({ testID:'passenger-map-surface' }).props.onLayout({ nativeEvent:{ layout:{ height:800,width:360 } } }));
    await act(async () => tree.root.findByType('NativeMapBoundary' as never).props.onLayout({ nativeEvent:{ layout:{ height:800,width:352 } } }));
    await act(async () => press('Punto de recogida'));
    await act(async () => press('Seleccionar origen en el mapa'));
    const map = () => tree.root.findByType('NativeMapBoundary' as never);
    h.projection.unproject = async () => { throw Error('native read failed'); };
    const event = { nativeEvent:{ bearing:0, center:origin.coordinate, userInteraction:true } };
    await act(async () => { map().props.onRegionWillChange(event); map().props.onRegionIsChanging(event); map().props.onPress({ nativeEvent:{ lngLat:north(201) } }); });
    assert.equal(reverses, 0); assert.equal(tree.root.findAllByProps({ testID:'passenger-fixed-pickup-pin' }).length, 1);
    await act(async () => map().props.onRegionDidChange(event)); await tick();
    assert.equal(reverses, 0);
    assert.ok(tree.root.findAll(n => String(n.type) === 'Pressable' && n.props.accessibilityLabel === 'Confirmar recogida')[0]!.props.disabled);
    h.projection.unproject = async (point: number[]) => { pixel = point; return north(120); };
    await act(async () => press('Reintentar punto')); await tick();
    assert.equal(reverses, 1); assert.equal(pixel![0], 176);
    await act(async () => press('Confirmar recogida')); await tick();
    assert.equal(tree.root.findAllByProps({ testID:'passenger-fixed-pickup-pin' }).length, 0);
    assert.equal(h.mounted.map, 1); assert.equal(h.mounted.sheet, 1);
  } finally { await act(async () => tree.unmount()); h.client.clear(); f.controls.dispose(); }
});

test('A uses settled native unprojection and keeps Driver arrival policy separate; no new continuous animation', () => {
  const screen = readFileSync('src/features/passenger/PassengerScreen.tsx','utf8');
  const panel = readFileSync('src/features/passenger/PickupSelectionPanel.tsx','utf8');
  assert.match(screen, /onPress: event[^\n]*pickingMap && !pickingPickup/);
  assert.match(screen, /unproject\(nativePinPoint\)/);
  assert.doesNotMatch(panel, /withRepeat|setInterval|setTimeout/);
  assert.match(readFileSync('gateway/matching/coordinator.ts','utf8'), /pickupRadiusMeters \?\? 150/);
});

test('A adjustment zone is geodesic and its ordinary MapLibre layers validate below route/Traffic/pins', async () => {
  const { createMapHarness } = require('./support/map-renderer.cjs');
  const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
  const h = createMapHarness(); const { PickupAreaLayer, pickupArea } = h.load('src/map/PickupAreaLayer.tsx');
  const { pickupDistanceMeters } = await import('../src/services/geospatial/pickup.ts');
  const data = pickupArea(origin.coordinate, 200);
  for (const point of data.geometry.coordinates[0]) assert.ok(Math.abs(pickupDistanceMeters(origin.coordinate, point) - 200) < 1e-6);
  const tree = await h.render(React.createElement(PickupAreaLayer, { reference:origin.coordinate,meters:200,outside:false }));
  try {
    const layers = tree.root.findAllByType('MapLibreLayer').map((n: any) => ({ id:n.props.id,type:n.props.type,source:'zone',paint:n.props.paint }));
    assert.deepEqual(validateStyleMin({version:8,sources:{zone:{type:'geojson',data}},layers}), []);
    assert.ok(tree.root.findAllByType('MapLibreLayer').every((n: any) => n.props.animatedProps === undefined));
    const map = readFileSync('src/features/passenger/PassengerMap.tsx','utf8');
    assert.ok(map.indexOf('<PickupAreaLayer') < map.indexOf('<TrafficFlowLayer'));
    assert.ok(map.indexOf('<PickupAreaLayer') < map.indexOf('<RouteLayer'));
  } finally { await h.act(async () => tree.unmount()); }
});
