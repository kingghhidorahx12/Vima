import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { createPassengerFixtureGateway, type FixtureClock } from '../src/dev/passenger/gateway.ts';
import { fixturePlaces, fixtureQuote } from '../src/dev/passenger/fixtures.ts';
import { canRequest, passengerPhase, type PassengerGateway, type PassengerTrip, type Place, type RideQuote } from '../src/features/passenger/model.ts';
import { matchingPolicy } from '../src/features/passenger/matchingPolicy.ts';
import { manualClock } from './support/manualClock.ts';
import { requestPassengerRide } from '../src/features/passenger/requests.ts';
import { executeConfirmedCommand, tripKey } from '../src/features/trip/queries.ts';
import type { ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const { createHarness } = require('./support/passenger-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const clock: FixtureClock = { after: () => () => {}, delay: async () => {} };
const quote = fixtureQuote({ origin: fixturePlaces[0]!, destination: fixturePlaces[1]!, stops: [] });

test('request remains pending until confirmation; ambiguous errors retain the same draft and no cached success', async () => {
  let finish!: () => void;
  const fixture = createPassengerFixtureGateway({ ...clock, delay: () => new Promise<void>((resolve) => { finish = resolve; }) });
  const client = new QueryClient();
  const pending = requestPassengerRide(client, fixture.gateway, quote, 'test-request');
  assert.equal(client.getQueryCache().getAll().length, 0);
  assert.equal(passengerPhase(undefined, false, true, true), 'requesting');
  finish();
  const result = await pending;
  assert.equal(result.phase, 'searching');
  assert.equal(client.getQueryData<PassengerTrip>(tripKey(result.id))?.quote, quote);
  fixture.controls.setConnection('offline');
  const rejected = requestPassengerRide(client, fixture.gateway, quote, 'same-retry-id');
  finish(); await assert.rejects(rejected);
  assert.equal(client.getQueryData<PassengerTrip>(tripKey(result.id))?.quote, quote);
  client.clear(); fixture.controls.dispose();
});

test('prolonged search continues without a command; editing requires cancellation and a new request', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const client = new QueryClient();
  const first = await requestPassengerRide(client, fixture.gateway, quote, 'request-1');
  fixture.controls.advance('prolonged');
  const prolonged = await fixture.gateway.fetch(first.id);
  assert.equal(prolonged.quote, quote);
  fixture.controls.advance('assigned');
  const assigned = await fixture.gateway.fetch(first.id);
  assert.equal(passengerPhase(assigned, true, true, false), 'assigned');
  assert.ok(assigned.assignment?.pin);
  fixture.controls.driverCancels();
  assert.equal((await fixture.gateway.fetch(first.id)).phase, 'reassigning');
  await executeConfirmedCommand(client, fixture.gateway, { tripId: first.id, commandId: 'edit-cancel', name: 'cancel', payload: { reason: 'edit' } });
  const revised = await requestPassengerRide(client, fixture.gateway, quote, 'edit-1');
  assert.notEqual(revised.id, first.id);
  assert.equal(revised.phase, 'searching');
  assert.equal(canRequest(quote, 'offline', false), false);
  client.clear(); fixture.controls.dispose();
});

test('fixture request ID is idempotent and rejects unapproved phases/actions', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const first = await fixture.gateway.request(quote, 'stable-id');
  const retry = await fixture.gateway.request(quote, 'stable-id');
  assert.equal(first.id, retry.id);
  await assert.rejects(fixture.gateway.execute({ tripId: first.id, commandId: 'bad', name: 'start-trip', payload: {} }));
  fixture.controls.dispose();
});

test('new fixture sessions cannot inherit an assigned trip from a previous session cache', async () => {
  const first = createPassengerFixtureGateway(clock);
  const second = createPassengerFixtureGateway(clock);
  const client = new QueryClient();
  const oldTrip = await requestPassengerRide(client, first.gateway, quote, 'request-old');
  first.controls.advance('assigned');
  client.setQueryData(tripKey(oldTrip.id), await first.gateway.fetch(oldTrip.id));
  const newTrip = await requestPassengerRide(client, second.gateway, quote, 'request-new');
  assert.notEqual(first.gateway.scope, second.gateway.scope);
  assert.notEqual(oldTrip.id, newTrip.id);
  assert.equal(client.getQueryData<PassengerTrip>(tripKey(newTrip.id))?.phase, 'searching');
  client.clear(); first.controls.dispose(); second.controls.dispose();
});

function press(tree: ReactTestRenderer, label: string) {
  const button = tree.root.findAll((node: ReactTestInstance) => String(node.type) === 'Pressable' &&
    (node.props.accessibilityLabel === label || node.findAll((child) => String(child.type) === 'Text' && child.props.children === label).length > 0))
    .find((node) => typeof node.props.onPress === 'function' && node.props.accessibilityRole !== 'adjustable');
  assert.ok(button, `Button not found: ${label}`);
  assert.ok(!button.props.disabled, `Button is disabled: ${label}`);
  button.props.onPress();
}
function text(tree: ReactTestRenderer) {
  return tree.root.findAll((node) => String(node.type) === 'Text')
    .flatMap((node) => [node.props.children].flat(Infinity)).filter((value) => typeof value === 'string' || typeof value === 'number').join(' ');
}
function nativeNode(tree: ReactTestRenderer, name: string) { return tree.root.find((node) => String(node.type) === name); }
function nativeNodes(tree: ReactTestRenderer, name: string) { return tree.root.findAll((node) => String(node.type) === name); }
async function settle(harness: ReturnType<typeof createHarness>) {
  await harness.act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
}

async function reachMatching(harness: ReturnType<typeof createHarness>, tree: ReactTestRenderer) {
  await settle(harness);
  await harness.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`));
  await settle(harness);
  await harness.act(async () => press(tree, 'Confirmar ubicaciones'));
  await settle(harness);
  await harness.act(async () => press(tree, 'Solicitar viaje'));
  await settle(harness);
}

test('a destination becomes recent only after explicit location confirmation', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const recorded: string[] = [];
  const gateway: PassengerGateway = { ...fixture.gateway,
    recordConfirmedDestination: async place => { recorded.push(place.id); } };
  const harness = createHarness(); const tree: ReactTestRenderer = await harness.render(gateway);
  try {
    await settle(harness);
    await harness.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`));
    await settle(harness);
    assert.deepEqual(recorded, []);
    await harness.act(async () => press(tree, 'Confirmar ubicaciones'));
    await settle(harness);
    assert.deepEqual(recorded, [fixturePlaces[1]!.id]);
  } finally { await harness.act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('no-result map choice keeps tapped coordinate when Reverse has no address', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const gateway: PassengerGateway = { ...fixture.gateway, findPlaces: async () => [],
    reversePlace: async () => null };
  const harness = createHarness(); const tree: ReactTestRenderer = await harness.render(gateway);
  try {
    await settle(harness);
    await harness.act(async () => press(tree, '¿A dónde vamos?'));
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('sin resultado'));
    await settle(harness);
    assert.ok(text(tree).includes('No encontramos resultados'));
    await harness.act(async () => press(tree, 'Elegir en el mapa'));
    await harness.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onPress({ nativeEvent: { lngLat: [-99.81, 19.81] } }));
    await harness.act(async () => press(tree, 'Confirmar ubicación'));
    assert.deepEqual(nativeNode(tree, 'PassengerMapContent').props.destination.coordinate, [-99.81, 19.81]);
  } finally { await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose(); }
});

test('a contributed place can be used immediately without making it a public catalog entry', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const submissions: { name: string; coordinate: readonly [number, number]; key: string }[] = [];
  const gateway: PassengerGateway = { ...fixture.gateway, findPlaces: async () => [],
    contributePlace: async (input, key) => {
      submissions.push({ name: input.name, coordinate: input.coordinate, key });
      return { id: 'contribution:pending', name: input.name, address: input.reference ?? '', coordinate: input.coordinate };
    } };
  const harness = createHarness(); const tree: ReactTestRenderer = await harness.render(gateway);
  try {
    await settle(harness);
    await harness.act(async () => press(tree, '¿A dónde vamos?'));
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('Lugar nuevo'));
    await settle(harness);
    await harness.act(async () => press(tree, 'Agregar lugar'));
    await harness.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onPress({ nativeEvent: { lngLat: [-99.82, 19.82] } }));
    await harness.act(async () => press(tree, 'Continuar'));
    await harness.act(async () => press(tree, 'Guardar'));
    await settle(harness);
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0]!.name, 'Lugar nuevo');
    assert.deepEqual(submissions[0]!.coordinate, [-99.82, 19.82]);
    await harness.act(async () => press(tree, 'Usar ahora'));
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.destination.id, 'contribution:pending');
  } finally { await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose(); }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('live suggestions resolve before selection; stale selection cannot overwrite a newer query', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const resolution = deferred<Place>();
  let count = 0;
  const gateway: PassengerGateway = { ...fixture.gateway, source: 'server',
    suggestPlaces: async () => [{ id: 'suggestion', name: 'Suggestion', address: 'Atlacomulco' }],
    resolvePlace: async () => ++count === 1 ? resolution.promise : fixturePlaces[2]!, closePlaces() {} };
  const harness = createHarness(); const tree: ReactTestRenderer = await harness.render(gateway);
  try {
    await settle(harness);
    await harness.act(async () => press(tree, '¿A dónde vamos?'));
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('Suggestion'));
    await settle(harness);
    await harness.act(async () => press(tree, 'Suggestion, Atlacomulco'));
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.destination, null);
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('new query'));
    await harness.act(async () => resolution.resolve(fixturePlaces[1]!));
    await settle(harness);
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.destination, null);
    await harness.act(async () => press(tree, 'Suggestion, Atlacomulco'));
    await settle(harness);
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.destination.id, fixturePlaces[2]!.id);
    assert.equal(harness.mounted.map, 1);
  } finally { await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose(); }
});

test('clearing or whitespace-only search cancels Suggest, removes loading and ignores a late result', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const old = deferred<readonly { id: string; name: string; address: string }[]>();
  const calls: string[] = []; let closes = 0;
  const gateway: PassengerGateway = { ...fixture.gateway, source: 'server',
    suggestPlaces: async (query) => { calls.push(query); return query === 'old' ? old.promise : []; },
    closePlaces() { closes++; } };
  const harness = createHarness(); const tree: ReactTestRenderer = await harness.render(gateway);
  const searchSpinners = () => nativeNodes(tree, 'ActivityIndicator').filter(node => node.props.accessibilityLabel !== 'Mapa');
  try {
    await settle(harness);
    await harness.act(async () => press(tree, '¿A dónde vamos?'));
    await settle(harness);
    assert.deepEqual(calls, []); assert.equal(searchSpinners().length, 0);
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('old'));
    await settle(harness);
    assert.deepEqual(calls, ['old']);
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText(''));
    await settle(harness);
    assert.equal(searchSpinners().length, 0);
    await harness.act(async () => old.resolve([{ id: 'old', name: 'Old result', address: 'Atlacomulco' }]));
    await settle(harness);
    assert.ok(!text(tree).includes('Old result'));
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('   '));
    await settle(harness);
    assert.deepEqual(calls, ['old']); assert.equal(searchSpinners().length, 0);
    assert.ok(closes > 0);
  } finally { await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose(); }
});

test('destination is editable while locating; late automatic origin never overwrites manual choice', async () => {
  const location = deferred<Place | null>();
  const fixture = createPassengerFixtureGateway(clock, { locate: () => location.promise });
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    assert.ok(text(tree).includes('Obteniendo tu ubicación...'));
    await harness.act(async () => press(tree, '¿A dónde vamos?'));
    const input = nativeNode(tree, 'TextInput');
    await harness.act(async () => input.props.onChangeText('Parque'));
    await settle(harness);
    await harness.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`));
    assert.ok(text(tree).includes('Obteniendo tu ubicación...'));
    await harness.act(async () => press(tree, 'Origen'));
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('Centro'));
    await settle(harness);
    await harness.act(async () => press(tree, `${fixturePlaces[2]!.name}, ${fixturePlaces[2]!.address}`));
    await harness.act(async () => location.resolve(fixturePlaces[0]!));
    await settle(harness);
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.origin.id, fixturePlaces[2]!.id);
    assert.ok(!text(tree).includes('Obteniendo tu ubicación...'));
    assert.ok(text(tree).includes('Confirmar ubicaciones'));
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('geolocation failure permits manual origin without a permission requirement', async () => {
  const fixture = createPassengerFixtureGateway(clock, { locate: async () => { throw new Error('Device location unavailable'); } });
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render({ ...fixture.gateway, recentPlaces: async () => [] });
  try {
    await settle(harness);
    assert.ok(text(tree).includes('No se pudo obtener tu ubicación'));
    assert.ok(!text(tree).includes('Device location unavailable'));
    await harness.act(async () => press(tree, 'Origen'));
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('Plaza'));
    await settle(harness);
    await harness.act(async () => press(tree, `${fixturePlaces[0]!.name}, ${fixturePlaces[0]!.address}`));
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.origin.id, fixturePlaces[0]!.id);
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('matching thresholds and 15-minute terminal limit use an injected clock, not real waiting', async () => {
  const time = manualClock();
  const fixture = createPassengerFixtureGateway(time.clock);
  const trip = await fixture.gateway.request(quote, 'policy');
  const phase = async () => (await fixture.gateway.fetch(trip.id)).phase;
  time.advance(59_999); assert.equal(await phase(), 'searching');
  time.advance(1); assert.equal(await phase(), 'expanding');
  time.advance(59_999); assert.equal(await phase(), 'expanding');
  time.advance(1); assert.equal(await phase(), 'prolonged');
  time.advance(matchingPolicy.limitMs - 120_001); assert.equal(await phase(), 'prolonged');
  time.advance(1); assert.equal(await phase(), 'expired');
  fixture.controls.advance('assigned'); assert.equal(await phase(), 'expired');
  assert.deepEqual((await fixture.gateway.fetch(trip.id)).quote, quote);
  fixture.controls.dispose();
});

test('alternatives appear at 120 seconds, search continues, and shell/map never remount', async () => {
  const time = manualClock();
  const fixture = createPassengerFixtureGateway(time.clock);
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    await reachMatching(harness, tree);
    for (const elapsed of [60_000, 59_999]) {
      await harness.act(async () => time.advance(elapsed)); await settle(harness);
      assert.ok(!text(tree).includes('Programar'));
      assert.ok(!text(tree).includes('Seguir buscando'));
    }
    assert.ok(text(tree).includes('Puede tomar unos minutos más.'));
    await harness.act(async () => time.advance(1)); await settle(harness);
    for (const label of ['Aún buscamos un conductor', 'Editar', 'Programar', 'Cancelar']) assert.ok(text(tree).includes(label));
    assert.ok(!text(tree).includes('Seguir buscando'));
    await harness.act(async () => time.advance(60_000)); await settle(harness);
    assert.ok(text(tree).includes('Aún buscamos un conductor'));
    await harness.act(async () => fixture.controls.advance('assigned')); await settle(harness);
    assert.ok(text(tree).includes('Tu conductor va en camino'));
    assert.ok(text(tree).includes('4826'));
    assert.ok(text(tree).includes('ABC-123'));
    assert.equal(tree.root.findAll(n => n.props.accessibilityLabel === 'Imagen del vehículo no disponible').length, 1);
    for (const label of ['Llamar', 'Seguridad']) {
      assert.equal(tree.root.findAllByType('Pressable' as never).filter(n => n.props.accessibilityLabel === label).length, 1);
    }
    assert.equal(harness.mounted.map, 1); assert.equal(harness.mounted.sheet, 1);
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('editing waits for authoritative cancellation, preserves draft and submits a fresh request', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const cancellation = deferred<void>();
  let oldId = '';
  const gateway: PassengerGateway = { ...fixture.gateway, execute: async (command) => {
    oldId = command.tripId; await cancellation.promise; return fixture.gateway.execute(command);
  } };
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(gateway);
  try {
    await reachMatching(harness, tree);
    await harness.act(async () => fixture.controls.advance('prolonged')); await settle(harness);
    await harness.act(async () => press(tree, 'Editar'));
    assert.equal((await fixture.gateway.fetch(oldId)).phase, 'prolonged');
    assert.ok(text(tree).includes('Aún buscamos un conductor'));
    assert.equal(nativeNodes(tree, 'TextInput').length, 0);
    await harness.act(async () => cancellation.resolve()); await settle(harness);
    assert.equal((await fixture.gateway.fetch(oldId)).phase, 'cancelled');
    assert.ok(text(tree).includes('Confirmar ubicaciones'));
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.origin.id, quote.origin.id);
    await harness.act(async () => press(tree, 'Confirmar ubicaciones')); await settle(harness);
    await harness.act(async () => press(tree, 'Solicitar viaje')); await settle(harness);
    const trips = harness.client.getQueryCache().findAll({ queryKey: ['trip'] });
    assert.ok(trips.some((item: { state: { data?: PassengerTrip } }) => item.state.data?.phase === 'searching' && item.state.data.id !== oldId));
    assert.equal(harness.mounted.map, 1);
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('schedule cancels immediate search before handing the complete draft to its boundary', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  fixture.controls.setStop(true);
  let delivered: RideQuote | undefined;
  let cancellationId = '';
  const gateway: PassengerGateway = { ...fixture.gateway, execute: async (command) => {
    cancellationId = command.tripId; return fixture.gateway.execute(command);
  } };
  const harness = createHarness({ schedule: (draft: RideQuote) => { delivered = draft; } });
  const tree: ReactTestRenderer = await harness.render(gateway);
  try {
    await reachMatching(harness, tree);
    await harness.act(async () => fixture.controls.advance('prolonged')); await settle(harness);
    await harness.act(async () => press(tree, 'Programar')); await settle(harness);
    const stopped = await fixture.gateway.fetch(cancellationId);
    assert.equal(stopped.phase, 'cancelled');
    assert.deepEqual(delivered, stopped.quote); assert.equal(delivered!.stops.length, 1);
    assert.ok(text(tree).includes('Confirmar ubicaciones'));
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('assignment winning an edit cancellation prevents editing the assigned trip', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const cancellation = deferred<void>();
  const gateway: PassengerGateway = { ...fixture.gateway, execute: async (command) => {
    await cancellation.promise; return fixture.gateway.execute(command);
  } };
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(gateway);
  try {
    await reachMatching(harness, tree);
    await harness.act(async () => fixture.controls.advance('prolonged')); await settle(harness);
    await harness.act(async () => press(tree, 'Editar'));
    await harness.act(async () => fixture.controls.advance('assigned')); await settle(harness);
    await harness.act(async () => cancellation.resolve()); await settle(harness);
    assert.ok(text(tree).includes('Tu conductor va en camino'));
    assert.ok(!text(tree).includes('Confirmar ubicaciones'));
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('a failed edit cancellation leaves the request searching and the draft closed', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    await reachMatching(harness, tree);
    await harness.act(async () => fixture.controls.advance('prolonged')); await settle(harness);
    fixture.controls.failNext();
    await harness.act(async () => press(tree, 'Editar')); await settle(harness);
    assert.ok(text(tree).includes('Aún buscamos un conductor'));
    assert.ok(!text(tree).includes('Confirmar ubicaciones'));
    assert.equal(nativeNodes(tree, 'TextInput').length, 0);
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('expiry stops the pulse and reuses location review with the complete draft on the same shell', async () => {
  const time = manualClock();
  const fixture = createPassengerFixtureGateway(time.clock);
  fixture.controls.setStop(true);
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    await reachMatching(harness, tree);
    await harness.act(async () => time.advance(matchingPolicy.limitMs)); await settle(harness);
    assert.ok(!text(tree).includes('Buscando un conductor'));
    assert.ok(text(tree).includes('Confirmar ubicaciones'));
    await harness.act(async () => press(tree, 'Confirmar ubicaciones')); await settle(harness);
    assert.ok(text(tree).includes(fixturePlaces[3]!.name));
    assert.equal(harness.mounted.map, 1); assert.equal(harness.mounted.sheet, 1);
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('keyboard dismissal blurs on background, map touch and drag while first result tap still selects', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    await settle(harness);
    await harness.act(async () => press(tree, '¿A dónde vamos?')); await settle(harness);
    const input = nativeNode(tree, 'TextInput');
    let inputTouchStopped = false;
    input.props.onTouchStart({ stopPropagation: () => { inputTouchStopped = true; } });
    assert.ok(inputTouchStopped); assert.ok(harness.mounted.inputFocused);
    await harness.act(async () => nativeNode(tree, 'ScrollView').props.onTouchStart());
    assert.ok(!harness.mounted.inputFocused);
    const before = harness.mounted.keyboardDismiss;
    await harness.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onTouchStart());
    await harness.act(async () => nativeNode(tree, 'ScrollView').props.onScrollBeginDrag());
    assert.equal(harness.mounted.keyboardDismiss, before + 2);
    assert.ok(harness.mounted.blur >= 3);
    assert.equal(nativeNode(tree, 'ScrollView').props.keyboardShouldPersistTaps, 'always');
    await harness.act(async () => input.props.onChangeText('Parque')); await settle(harness);
    await harness.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`)); await settle(harness);
    assert.ok(text(tree).includes('Confirmar ubicaciones'));
    assert.equal(nativeNodes(tree, 'TextInput').length, 0);
  } finally {
    await harness.act(async () => tree.unmount()); harness.client.clear(); fixture.controls.dispose();
  }
});

test('rendered passenger flow preserves the actual shell/map instance across matching, assignment, offline and reassignment', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    await settle(harness);
    const mapViewport = tree.root.findAll((node) => String(node.type) === 'View'
      && typeof node.props.onLayout === 'function' && node.props.style?.flex === 1)[0];
    assert.ok(mapViewport);
    await harness.act(async () => mapViewport.props.onLayout({ nativeEvent: { layout: { height: 1000 } } }));
    const assertSingleSheetSnap = () => {
      const sheet = tree.root.findAll((node) => String(node.type) === 'SheetBoundary')[0];
      assert.ok(sheet);
      const interaction = sheet.props.interaction;
      assert.deepEqual(interaction.allowedOffsets, [interaction.targetOffset]);
      assert.equal(tree.root.findAll((node) => node.props.accessibilityRole === 'adjustable').length, 0);
    };
    assertSingleSheetSnap();
    assert.ok(text(tree).includes('¿A dónde vamos?'));
    const lockup = tree.root.findAll((node) => String(node.type) === 'Image' &&
      String(node.props.source).endsWith('vima_header_lockup_final.png'));
    assert.equal(lockup.length, 1);
    assert.match(String(lockup[0]!.props.source), /vima_header_lockup_final\.png$/);
    assert.equal(lockup[0]!.props.style.height, 28);
    assert.ok(!text(tree).includes('Vima'));
    assert.ok(text(tree).includes('Casa'));
    assert.ok(text(tree).includes('Trabajo'));
    assert.ok(text(tree).includes('Favoritos'));
    assert.ok(!text(tree).includes('Datos de prueba'));
    await harness.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`));
    await settle(harness);
    assert.ok(text(tree).includes('Confirmar ubicaciones'));
    assert.ok(!text(tree).includes('Solicitar viaje'));
    await harness.act(async () => press(tree, 'Confirmar ubicaciones'));
    await settle(harness);
    assert.ok(text(tree).includes('Confirma tu viaje'));
    assertSingleSheetSnap();
    assert.ok(text(tree).includes('Duración'));
    assert.ok(text(tree).includes('Distancia'));
    assert.ok(text(tree).includes('Precio estimado'));
    await harness.act(async () => press(tree, 'Solicitar viaje'));
    await settle(harness);
    assert.ok(text(tree).includes('Buscando un conductor'));
    assertSingleSheetSnap();
    assert.ok(text(tree).includes('Te conectaremos con el conductor más cercano disponible.'));
    await harness.act(async () => fixture.controls.advance('prolonged'));
    await settle(harness);
    assert.ok(!text(tree).includes('Seguir buscando'));
    assert.ok(text(tree).includes('Editar'));
    await harness.act(async () => fixture.controls.advance('assigned'));
    await settle(harness);
    assert.ok(text(tree).includes('Tu conductor va en camino'));
    assert.ok(text(tree).includes('4826'));
    assert.equal(harness.mounted.haptics.filter((event: string) => event === 'driverFound').length, 1);
    await harness.act(async () => fixture.controls.setConnection('offline'));
    await settle(harness);
    assert.ok(text(tree).includes('4826'));
    assert.ok(text(tree).includes('Sin conexión'));
    await harness.act(async () => fixture.controls.driverCancels());
    await settle(harness);
    assert.ok(text(tree).includes('4826')); // Keep last known context until reconnect/refetch.
    await harness.act(async () => fixture.controls.setConnection('online'));
    await settle(harness);
    assert.ok(text(tree).includes('Buscando un conductor'));
    assert.equal(harness.mounted.map, 1);
    assert.equal(harness.mounted.unmountedMap, 0);
    assert.equal(harness.mounted.sheet, 1);
    assert.ok(!text(tree).includes('Iniciar viaje'));
    assert.ok(!text(tree).includes('Aceptar conductor'));
  } finally {
    await harness.act(async () => tree.unmount());
    harness.client.clear(); fixture.controls.dispose();
  }
});

test('compact map layers start off and persist user toggles locally', async () => {
  const previous = process.env.EXPO_PUBLIC_TOMTOM_DISPLAY_KEY;
  process.env.EXPO_PUBLIC_TOMTOM_DISPLAY_KEY = 'display-test-only';
  const fixture = createPassengerFixtureGateway(clock);
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    await settle(harness);
    const viewport = tree.root.findAll((node) => String(node.type) === 'View' &&
      typeof node.props.onLayout === 'function' && node.props.style?.flex === 1)[0]!;
    await harness.act(async () => viewport.props.onLayout({ nativeEvent: { layout: { height: 1000 } } }));
    await harness.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onDidFinishLoadingMap());
    await harness.act(async () => press(tree, 'Capas del mapa'));
    const toggle = (label: string) => tree.root.findAll((node) => node.props.accessibilityRole === 'switch' &&
      node.props.accessibilityLabel === label)[0]!;
    assert.equal(toggle('Tráfico').props.accessibilityState.checked, false);
    assert.equal(toggle('Incidentes').props.accessibilityState.checked, false);
    await harness.act(async () => press(tree, 'Tráfico'));
    assert.equal(toggle('Tráfico').props.accessibilityState.checked, true);
    assert.deepEqual(JSON.parse(harness.kv.get('vima.map-layers.v1')), { traffic: true, incidents: false });
    await harness.act(async () => press(tree, 'Incidentes'));
    assert.deepEqual(JSON.parse(harness.kv.get('vima.map-layers.v1')), { traffic: true, incidents: true });
  } finally {
    await harness.act(async () => tree.unmount());
    harness.client.clear(); fixture.controls.dispose();
    if (previous === undefined) delete process.env.EXPO_PUBLIC_TOMTOM_DISPLAY_KEY;
    else process.env.EXPO_PUBLIC_TOMTOM_DISPLAY_KEY = previous;
  }
});

test('missing location requires an explicit valid origin; recoverable request failure preserves quote and destinations', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  fixture.controls.setLocationAvailable(false);
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    await settle(harness);
    await harness.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`));
    await settle(harness);
    assert.ok(!text(tree).includes('Confirma tu viaje'));
    await harness.act(async () => press(tree, 'Origen'));
    await harness.act(async () => nativeNode(tree, 'TextInput').props.onChangeText('Plaza'));
    await settle(harness);
    await harness.act(async () => press(tree, `${fixturePlaces[0]!.name}, ${fixturePlaces[0]!.address}`));
    await settle(harness);
    assert.ok(text(tree).includes('Confirmar ubicaciones'));
    await harness.act(async () => press(tree, 'Confirmar ubicaciones'));
    await settle(harness);
    assert.ok(text(tree).includes('Confirma tu viaje'));
    fixture.controls.failNext();
    await harness.act(async () => press(tree, 'Solicitar viaje'));
    await settle(harness);
    assert.ok(text(tree).includes('Error recuperable'));
    assert.ok(text(tree).includes(fixturePlaces[1]!.name));
    assert.ok(text(tree).includes('Confirma tu viaje'));
    await harness.act(async () => press(tree, 'Solicitar viaje'));
    await settle(harness);
    assert.ok(text(tree).includes('Buscando un conductor'));
    assert.equal(harness.mounted.map, 1);
  } finally {
    await harness.act(async () => tree.unmount());
    harness.client.clear(); fixture.controls.dispose();
  }
});

test('header and Android back return drafts home without unmounting the shell or cancelling active rides', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const h = createHarness(); const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(h);
    for (const confirmed of [false, true]) {
      await h.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`));
      await settle(h);
      if (confirmed) await h.act(async () => press(tree, 'Confirmar ubicaciones'));
      await h.act(async () => confirmed ? assert.equal(h.back(), true) : press(tree, 'Volver'));
      assert.ok(text(tree).includes('Viajes recientes'));
      assert.equal(nativeNode(tree, 'PassengerMapContent').props.destination, null);
      assert.equal(h.mounted.map, 1);
    }
    await h.act(async () => press(tree, '¿A dónde vamos?'));
    await h.act(async () => assert.equal(h.back(), true));
    assert.equal(nativeNodes(tree, 'TextInput').length, 0);
    await reachMatching(h, tree);
    await h.act(async () => assert.equal(h.back(), true));
    assert.ok(text(tree).includes('Buscando un conductor'));
  } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
  assert.equal(h.back(), undefined);
});

test('incident detail closes by outside tap, close button and Android back, including sparse data', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  const h = createHarness(); const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(h);
    const layout = tree.root.findAllByType('View' as never).find(node => node.props.onLayout && node.props.style?.flex === 1)!;
    await h.act(async () => layout.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 } } }));
    for (const close of ['button', 'outside', 'back']) {
      await h.act(async () => nativeNode(tree, 'PassengerMapContent').props.onIncidentSelect({ category: 'Obras', description: 'Obras en la vía', severity: 'Tráfico lento' }));
      assert.ok(text(tree).includes('Obras en la vía'));
      await h.act(async () => {
        if (close === 'button') press(tree, 'Cerrar detalle del incidente');
        else if (close === 'back') h.back();
        else nativeNode(tree, 'NativeMapBoundary').props.onPress({ nativeEvent: { lngLat: [-99, 19] } });
      });
      assert.ok(!text(tree).includes('Obras en la vía'));
    }
    await h.act(async () => nativeNode(tree, 'PassengerMapContent').props.onIncidentSelect({}));
    assert.ok(text(tree).includes('Incidente'));
    await h.act(async () => press(tree, 'Cerrar detalle del incidente'));
  } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('recenter acknowledges only the native completion at the requested coordinate', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(h);
    const layout = tree.root.findAllByType('View' as never).find(node => node.props.onLayout && node.props.style?.flex === 1)!;
    await h.act(async () => layout.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 } } }));
    await h.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onDidFinishLoadingMap());
    h.projection.point = [190, 680];
    await h.act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
    await h.act(async () => press(tree, 'Tu ubicación'));
    assert.ok(!text(tree).includes('Ubicación centrada'));
    assert.equal(tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Tu ubicación')!
      .props.accessibilityState.busy, true);
    const coordinate = nativeNode(tree, 'PassengerMapContent').props.recenter.coordinate;
    await h.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onRegionDidChange({ nativeEvent: { center: [0, 0], userInteraction: false } }));
    assert.ok(!text(tree).includes('Ubicación centrada'));
    await h.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onRegionDidChange({ nativeEvent: { center: coordinate, userInteraction: false } }));
    assert.ok(text(tree).includes('Ubicación centrada'));
    assert.equal(tree.root.findAllByType('Pressable' as never).filter(n => n.props.accessibilityLabel === 'Tu ubicación').length, 0);
    assert.equal(text(tree).split('Ubicación centrada').length - 1, 1);
    await h.act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    assert.ok(!text(tree).includes('Ubicación centrada'));
    await h.act(async () => press(tree, 'Tu ubicación'));
    await h.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onRegionDidChange({ nativeEvent: { center: coordinate, userInteraction: false } }));
    assert.equal(text(tree).split('Ubicación centrada').length - 1, 1);
  } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('only explicit location confirmation emits a full route fit after the sheet is measured', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(h);
    const layout = tree.root.findAllByType('View' as never).find(node => node.props.onLayout && node.props.style?.flex === 1)!;
    await h.act(async () => layout.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 } } }));
    await h.act(async () => press(tree, '¿A dónde vamos?'));
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.fitRoute, undefined);
    await h.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`));
    await settle(h);
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.fitRoute, undefined);
    await h.act(async () => press(tree, 'Confirmar ubicaciones'));
    await settle(h);
    const scroll = tree.root.findAllByType('ScrollView' as never).find(node => node.props.onContentSizeChange)!;
    await h.act(async () => scroll.props.onContentSizeChange(400, 280));
    const fit = nativeNode(tree, 'PassengerMapContent').props.fitRoute;
    assert.ok(fit);
    assert.equal(fit.coordinates[0][0], fixturePlaces[0]!.coordinate[0]);
    assert.equal(fit.coordinates.at(-1)[0], fixturePlaces[1]!.coordinate[0]);
    assert.ok(fit.coordinates.length >= 3);
    const sequence = fit.sequence;
    await h.act(async () => scroll.props.onContentSizeChange(400, 280));
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.fitRoute.sequence, sequence);
  } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
});

// Quote fixtures stay inside tests and never enter the mobile production dependency graph.
test('live quote UI keeps valid snapshots across reconnect and requires a new review after expiry', async () => {
  const fixture = createPassengerFixtureGateway(clock);
  let calls = 0; const operations: string[] = [];
  const gateway: PassengerGateway = { ...fixture.gateway, source: 'server', paymentReady: false, tripRequestAvailable: false,
    quote: async (draft, _signal, operationId) => {
      calls++; operations.push(operationId!);
      const { priceTrip } = await import('../gateway/pricing/engine.ts');
      const { syntheticPricing, syntheticRoute } = await import('./support/pricing-fixture.ts');
      const priced = priceTrip({ config: syntheticPricing(), profile: 'URBANO', routeMetrics: syntheticRoute });
      const now = Date.now();
      return { ...fixtureQuote(draft), price: undefined, paymentMethod: undefined, id: `server-${calls}`,
        pricing: { status: 'priced', quote: { ...draft, id: `server-${calls}`, createdAt: now, expiresAt: now + (calls === 1 ? 800 : 300000),
          route: syntheticRoute, configVersion: 'SYNTHETIC_PRICING_TEST_ONLY', profile: 'URBANO', distanceMeters: syntheticRoute.distanceMeters, ...priced } } };
    } };
  const h = createHarness(); const tree: ReactTestRenderer = await h.render(gateway);
  try {
    await settle(h);
    await h.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`)); await settle(h);
    await h.act(async () => press(tree, 'Confirmar ubicaciones')); await settle(h);
    assert.ok(text(tree).includes('6.66'));
    const submit = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Solicitar viaje')!;
    assert.equal(submit.props.disabled, true);
    await h.act(async () => fixture.controls.setConnection('offline'));
    await h.act(async () => fixture.controls.setConnection('online')); await settle(h);
    assert.equal(calls, 1);
    await h.act(async () => { await new Promise(resolve => setTimeout(resolve, 850)); }); await settle(h);
    assert.equal(calls, 2); assert.notEqual(operations[0], operations[1]);
    assert.ok(text(tree).includes('La cotización venció'));
    assert.ok(text(tree).includes('Confirmar ubicaciones'));
    await h.act(async () => press(tree, 'Confirmar ubicaciones')); assert.ok(!text(tree).includes('La cotización venció'));
  } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('map control press feedback and layer switches use approved timing and obey Reduced Motion', async () => {
  for (const reduced of [false, true]) {
    const fixture = createPassengerFixtureGateway(clock); const h = createHarness({}, { reduced });
    const tree: ReactTestRenderer = await h.render(fixture.gateway);
    try {
      await settle(h);
      const layout = tree.root.findAllByType('View' as never).find(node => node.props.onLayout && node.props.style?.flex === 1)!;
      await h.act(async () => layout.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 } } }));
      await h.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onDidFinishLoadingMap());
      const button = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Capas del mapa')!;
      const paint = (node: ReactTestInstance, pressed: boolean) => Object.assign({}, ...node.props.style({ pressed }).filter(Boolean));
      assert.equal(paint(button, false).backgroundColor, '#FFFFFF');
      assert.equal(paint(button, true).backgroundColor, '#EAF3FF');
      assert.equal(paint(button, false).width, 48);
      const before = h.animations.length;
      await h.act(async () => button.props.onPressIn());
      assert.equal(h.animations.length > before, !reduced);
      if (!reduced) assert.equal(h.animations.at(-1).duration, 160);
      await h.act(async () => button.props.onPressOut());
      await h.act(async () => press(tree, 'Capas del mapa'));
      assert.equal(tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Capas del mapa')!
        .props.accessibilityState.expanded, true);
      const layersButton = tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Capas del mapa')!;
      assert.equal(paint(layersButton, false).backgroundColor, '#2F80FF');
      assert.equal(paint(layersButton, true).backgroundColor, '#1E6FE8');
      assert.ok(text(tree).includes('Tráfico')); assert.ok(text(tree).includes('Incidentes'));
      assert.ok(!text(tree).includes('Siniestros'));
    } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
  }
});

test('location CTA follows settled projection and actual sheet height without commanding the camera', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  const visible = () => tree.root.findAllByType('Pressable' as never).some(n => n.props.accessibilityLabel === 'Tu ubicación');
  const settleProjection = () => h.act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
  const region = () => nativeNode(tree, 'NativeMapBoundary').props.onRegionDidChange({ nativeEvent: { center: [0, 0], userInteraction: true } });
  try {
    await settle(h);
    const layout = tree.root.findAllByType('View' as never).find(n => n.props.onLayout && n.props.style?.flex === 1)!;
    await h.act(async () => layout.props.onLayout({ nativeEvent: { layout: { width: 390, height: 700 } } }));
    await h.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onDidFinishLoadingMap());
    await settleProjection(); assert.equal(visible(), false);
    h.projection.point = [195, 480];
    await h.act(async () => region()); await settleProjection();
    assert.equal(visible(), true);
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.recenter, undefined);
    await h.act(async () => nativeNode(tree, 'SheetBoundary').props.onVisibleHeightChange(100));
    await settleProjection(); assert.equal(visible(), false);
    await h.act(async () => nativeNode(tree, 'SheetBoundary').props.onVisibleHeightChange(400));
    await settleProjection(); assert.equal(visible(), true);
    h.projection.point = [195, 120];
    await h.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onRegionWillChange());
    await settleProjection(); assert.equal(visible(), true); // Do not chatter mid-gesture.
    await h.act(async () => region()); await settleProjection(); assert.equal(visible(), false);
    let finish: (point: number[]) => void = () => {};
    h.projection.project = () => new Promise(resolve => { finish = resolve; });
    await h.act(async () => region()); await settleProjection();
    await h.act(async () => nativeNode(tree, 'NativeMapBoundary').props.onRegionWillChange());
    await h.act(async () => finish([195, 680]));
    assert.equal(visible(), false); // Ignore an obsolete native reply.
    assert.equal(h.mounted.map, 1);
  } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
});

test('bottom Inicio reuses returnHome from selection/search and is absent during an active ride', async () => {
  const fixture = createPassengerFixtureGateway(clock); const h = createHarness();
  const tree: ReactTestRenderer = await h.render(fixture.gateway);
  try {
    await settle(h);
    await h.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`)); await settle(h);
    await h.act(async () => press(tree, 'Origen'));
    await h.act(async () => press(tree, 'Inicio')); await settle(h);
    assert.ok(text(tree).includes('¿A dónde vamos?'));
    assert.equal(tree.root.findAllByType('TextInput' as never).length, 0);
    assert.equal(nativeNode(tree, 'PassengerMapContent').props.destination, null);
    assert.equal(tree.root.findAllByType('Pressable' as never).find(n => n.props.accessibilityLabel === 'Inicio')!.props.accessibilityState.selected, true);
    await h.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`)); await settle(h);
    await h.act(async () => press(tree, 'Confirmar ubicaciones')); await settle(h);
    await h.act(async () => press(tree, 'Solicitar viaje')); await settle(h);
    assert.equal(tree.root.findAllByType('Pressable' as never).filter(n => n.props.accessibilityLabel === 'Inicio').length, 0);
    assert.equal(h.mounted.map, 1);
  } finally { await h.act(async () => tree.unmount()); fixture.controls.dispose(); }
});
