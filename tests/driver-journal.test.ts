import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, p, driver, flush } from './support/lifecycle-fixture.ts';
import { createDriverJournal } from '../src/services/matching/driverJournal.ts';
import type { DriverState } from '../src/services/matching/contracts.ts';
import type { LifecycleCommand, TripTelemetry } from '../src/services/matching/lifecycle.ts';

async function fixture(stops = 0) {
  const f = setup(1); const quote = f.quotes.get('quote')!.quote; quote.stops = Array.from({ length: stops }, () => quote.destination);
  await f.ready(); await f.available(1); const trip = await f.c.create(p, 'quote', 'request'); await flush();
  await f.c.offerAction(driver(1), (await f.c.driver(driver(1))).offer!.id, 'accept', 'accept');
  const assignment = (await f.c.fetch(p, trip.id)).assignment!;
  await f.c.location(driver(1), [0.2, 0.2], 0, 'pickup'); await f.c.lifecycleCommand(driver(1), trip.id, assignment.id, 'arrive', { name: 'arrive' });
  let state = await f.c.driver(driver(1)); let offline = false; let lostReceipt = false; let failStorage = false;
  const events: string[] = []; const data = new Map<string, string>();
  const storage = { async getItem(k: string) { return data.get(k) ?? null; }, async setItem(k: string, v: string) { if (failStorage) throw new Error('disk'); data.set(k, v); }, async removeItem(k: string) { data.delete(k); } };
  const client = {
    async driver() { events.push('GET'); if (offline) throw new Error('offline'); return f.c.driver(driver(1)); },
    async telemetry(id: string, aid: string, sample: TripTelemetry) {
      events.push(`telemetry:${sample.sequence}`); if (offline) throw new Error('offline'); const result = await f.c.telemetry(driver(1), id, aid, sample);
      if (lostReceipt) { lostReceipt = false; throw new Error('lost receipt'); } return result;
    },
    async lifecycleCommand(id: string, aid: string, cid: string, command: LifecycleCommand) {
      events.push(`${command.name}:${cid}`); if (offline) throw new Error('offline'); const result = await f.c.lifecycleCommand(driver(1), id, aid, cid, command);
      if (lostReceipt) { lostReceipt = false; throw new Error('lost receipt'); } return result;
    },
  };
  const journal = () => createDriverJournal(storage, 'd1', client, v => { state = v; });
  return { f, trip, assignment, data, events, journal, storage, client,
    get state() { return state; }, setOffline(v: boolean) { offline = v; }, loseReceipt() { lostReceipt = true; }, failStorage(v: boolean) { failStorage = v; },
    async start() { state = await f.c.lifecycleCommand(driver(1), trip.id, assignment.id, 'start', { name: 'start', pin: assignment.pin }); },
  };
}

test('offline prohibited pre-PIN; durable post-PIN replay GET first, stable IDs/sequence through process restart', async () => {
  const h = await fixture(); try {
    let j = h.journal(); await assert.rejects(j.enqueueTelemetry(h.state, [0.2, 0.2], h.f.clock.now()), /offline_not_available/);
    await h.start(); h.setOffline(true);
    await j.enqueueTelemetry(h.state, [0.2, 0.2], h.f.clock.now()); h.f.clock.advance(12000);
    await j.enqueueTelemetry(h.state, [0.201, 0.2], h.f.clock.now());
    await j.enqueueCommand(h.state, 'stable-finish', { name: 'finish', kind: 'early', finalTelemetrySequence: 0 });
    const durable = [...h.data.values()]; await assert.rejects(j.sync(), /offline/); assert.deepEqual([...h.data.values()], durable);
    await h.f.restart(); j = h.journal(); h.setOffline(false); h.events.length = 0;
    await j.sync(); assert.deepEqual(h.events, ['GET', 'telemetry:1', 'telemetry:2', 'finish:stable-finish']);
    assert.equal(h.state.assignment?.state, 'PAYMENT_PENDING'); assert.equal(h.data.size, 0);
    assert.equal((await h.f.c.fetch(p, h.trip.id)).lifecycle.settlement!.metrics.lastSequence, 2);
  } finally { h.f.close(); }
});

test('stationary trip: no sample blocks finish, confirmed zero meters does not', async () => {
  const h = await fixture(); try {
    await h.start(); const journal = h.journal();
    await assert.rejects(journal.enqueueCommand(h.state, 'finish-no-sample', {
      name: 'finish', kind: 'normal', finalTelemetrySequence: 0,
    }), /journal_telemetry_pending/);
    assert.equal(await journal.pending(), 0);
    await journal.enqueueTelemetry(h.state, [0.2, 0.2], h.f.clock.now());
    await journal.sync();
    assert.equal(h.state.assignment?.lifecycle.meter?.distanceMeters, 0);
    assert.equal(h.state.assignment?.lifecycle.meter?.lastSequence, 1);
    await journal.enqueueCommand(h.state, 'finish-stationary', {
      name: 'finish', kind: 'normal', finalTelemetrySequence: 1,
    });
    await journal.sync();
    assert.equal(h.state.assignment?.state, 'PAYMENT_PENDING');
    assert.equal(await journal.pending(), 0);
  } finally { h.f.close(); }
});

for (const at of ['telemetry', 'finish', 'cash'] as const) test(`lost ${at} receipt retries identity, GET precedes replay, ack crash safe`, async () => {
  const h = await fixture(); try {
    await h.start(); let j = h.journal();
    await j.enqueueTelemetry(h.state, [0.2, 0.2], h.f.clock.now());
    if (at !== 'telemetry') await j.sync();
    if (at !== 'telemetry') await j.enqueueCommand(h.state, 'finish', { name: 'finish', kind: 'normal', finalTelemetrySequence: 1 });
    if (at === 'cash') { await j.sync(); await j.enqueueCommand(h.state, 'cash', { name: 'cash_problem' }); }
    h.loseReceipt(); await assert.rejects(j.sync(), /lost receipt/); assert.equal(await j.pending(), 1);
    const before = await h.f.c.fetch(p, h.trip.id); await h.f.restart(); j = h.journal(); h.events.length = 0;
    await j.sync(); assert.equal(h.events[0], 'GET'); assert.equal(await j.pending(), 0);
    assert.equal((await h.f.c.fetch(p, h.trip.id)).revision, before.revision);
    if (at === 'cash') assert.equal(h.state.lastTrip?.lifecycle.disputeId, before.lifecycle.disputeId);
  } finally { h.f.close(); }
});

test('journal storage failure never acknowledges queued; duplicate finish blocked; account/assignment replacement requires successful GET', async () => {
  const h = await fixture(); try {
    await h.start(); const j = h.journal(); h.failStorage(true);
    await assert.rejects(j.enqueueTelemetry(h.state, [0.2, 0.2], h.f.clock.now()), /disk/); assert.equal(await j.pending(), 0);
    h.failStorage(false); await j.enqueueTelemetry(h.state, [0.2, 0.2], h.f.clock.now());
    await j.enqueueCommand(h.state, 'finish', { name: 'finish', kind: 'normal', finalTelemetrySequence: 1 });
    await assert.rejects(j.enqueueCommand(h.state, 'another-finish', { name: 'finish', kind: 'early', finalTelemetrySequence: 1 }), /command_already_queued/);
    await assert.rejects(j.enqueueTelemetry(h.state, [0.3, 0.3], h.f.clock.now()), /finish_already_queued/);
    const replacement: DriverState = structuredClone(h.state); replacement.assignment!.value = { ...replacement.assignment!.value, id: 'replacement' };
    let getFails = true; let posts = 0;
    const replacementClient = { async driver() { if (getFails) throw new Error('offline'); return replacement; },
      async telemetry() { posts++; return replacement; }, async lifecycleCommand() { posts++; return replacement; } };
    const recovered = createDriverJournal(h.storage, 'd1', replacementClient, () => {});
    await assert.rejects(recovered.sync()); assert.equal(await recovered.pending(), 2);
    getFails = false; await recovered.sync(); assert.equal(posts, 0); assert.equal(await recovered.pending(), 0);
  } finally { h.f.close(); }
});

test('finish cannot be sent until its final sequence is confirmed; corrupt journal never silently dropped', async () => {
  const h = await fixture(); try {
    await h.start(); const j = h.journal();
    await assert.rejects(j.enqueueCommand(h.state, 'finish', { name: 'finish', kind: 'normal', finalTelemetrySequence: 1 }), /journal_telemetry_pending/);
    h.data.set('vima.driver-journal.v1.d1', '{bad');
    await assert.rejects(j.sync()); assert.equal(h.data.get('vima.driver-journal.v1.d1'), '{bad');
  } finally { h.f.close(); }
});

test('late render snapshots cannot reuse acknowledged sequence or queue telemetry after finish', async () => {
  const h = await fixture(); try {
    await h.start(); const stale = h.state; const j = h.journal();
    await j.enqueueTelemetry(stale, [0.2, 0.2], h.f.clock.now()); await j.sync();
    h.f.clock.advance(1000);
    const next = await j.enqueueTelemetry(stale, [0.201, 0.2], h.f.clock.now()); assert.equal(next.sequence, 2);
    await j.enqueueCommand(stale, 'finish', { name: 'finish', kind: 'normal', finalTelemetrySequence: 0 }); await j.sync();
    await assert.rejects(j.enqueueTelemetry(stale, [0.202, 0.2], h.f.clock.now()), /offline_not_available/);
  } finally { h.f.close(); }
});

test('offline ordered stops remain pending intents and precede dependent normal finish', async () => {
  const h = await fixture(2); try {
    await h.start(); h.setOffline(true); const j = h.journal();
    await j.enqueueTelemetry(h.state, [0.2, 0.2], h.f.clock.now());
    await j.enqueueCommand(h.state, 'stop-0', { name: 'complete_stop', stopIndex: 0 });
    await j.enqueueCommand(h.state, 'stop-1', { name: 'complete_stop', stopIndex: 1 });
    await j.enqueueCommand(h.state, 'finish', { name: 'finish', kind: 'normal', finalTelemetrySequence: 0 });
    assert.equal(h.state.assignment!.lifecycle.completedStops, 0); assert.equal((await j.pendingCommands()).length, 3);
    await assert.rejects(j.sync()); await h.f.restart(); h.setOffline(false); h.events.length = 0;
    await h.journal().sync();
    assert.deepEqual(h.events, ['GET', 'telemetry:1', 'complete_stop:stop-0', 'complete_stop:stop-1', 'finish:finish']);
    assert.equal(h.state.assignment!.lifecycle.completedStops, 2); assert.equal(h.state.assignment!.state, 'PAYMENT_PENDING');
  } finally { h.f.close(); }
});

test('GET with same assignment unexpectedly pre-PIN preserves journal; stale callbacks never target replacement', async () => {
  const h = await fixture(); try {
    await h.start(); const old = h.state;
    await h.journal().enqueueTelemetry(old, [0.2, 0.2], h.f.clock.now());
    const remote = structuredClone(old); remote.revision++; remote.assignment!.state = 'ARRIVED_PICKUP';
    let posts = 0;
    const recovered = createDriverJournal(h.storage, 'd1', {
      async driver() { return remote; }, async telemetry() { posts++; return remote; }, async lifecycleCommand() { posts++; return remote; },
    }, () => {});
    await assert.rejects(recovered.sync(), /journal_state_mismatch/); assert.equal(await recovered.pending(), 1); assert.equal(posts, 0);
    remote.assignment!.state = 'IN_PROGRESS'; remote.assignment!.value = { ...remote.assignment!.value, id: 'replacement' }; remote.revision++;
    await recovered.sync(); assert.equal(await recovered.pending(), 0);
    await assert.rejects(recovered.enqueueTelemetry(old, [0.2, 0.2], h.f.clock.now()), /journal_requires_reconcile/);
    await assert.rejects(recovered.enqueueCommand(old, 'stale', { name: 'finish', kind: 'normal', finalTelemetrySequence: 1 }), /journal_requires_reconcile/);
    assert.equal(await recovered.pending(), 0); assert.equal(posts, 0);
  } finally { h.f.close(); }
});
