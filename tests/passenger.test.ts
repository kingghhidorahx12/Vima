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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('destination is editable while locating; late automatic origin never overwrites manual choice', async () => {
  const location = deferred<Place | null>();
  const fixture = createPassengerFixtureGateway(clock, { locate: () => location.promise });
  const harness = createHarness();
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    assert.ok(text(tree).includes('Obteniendo tu ubicación...'));
    await harness.act(async () => press(tree, '¿A dónde vas?'));
    const input = nativeNode(tree, 'TextInput');
    await harness.act(async () => input.props.onChangeText('Parque'));
    await settle(harness);
    await harness.act(async () => press(tree, `${fixturePlaces[1]!.name}, ${fixturePlaces[1]!.address}`));
    assert.ok(text(tree).includes('Obteniendo tu ubicación...'));
    await harness.act(async () => press(tree, 'Origen'));
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
  const tree: ReactTestRenderer = await harness.render(fixture.gateway);
  try {
    await settle(harness);
    assert.ok(text(tree).includes('No se pudo obtener tu ubicación'));
    assert.ok(!text(tree).includes('Device location unavailable'));
    await harness.act(async () => press(tree, 'Origen'));
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
    await harness.act(async () => press(tree, '¿A dónde vas?')); await settle(harness);
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
    assert.ok(text(tree).includes('¿A dónde vas?'));
    const lockup = tree.root.findAll((node) => String(node.type) === 'Image' && node.props.accessibilityLabel === 'Vima');
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
