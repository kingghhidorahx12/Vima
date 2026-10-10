import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, p, other, driver, flush } from './support/lifecycle-fixture.ts';
import { decodeMatchingTrip, decodeDriver } from '../src/services/matching/decode.ts';
import { parseTelemetry } from '../gateway/matching/lifecycle.ts';

test('assigned vehicle follows authority through pickup, telemetry, long-poll and restart; other passengers cannot read it', async () => {
  const f = setup(1);
  try {
    await f.ready(); await f.available(1);
    const trip = await f.c.create(p, 'quote', 'create'); await flush();
    // An offer is not a location authority: acceptance uses the latest driver fix.
    await f.c.location(driver(1), [.2, .2], 90, 'latest');
    await f.c.offerAction(driver(1), (await f.c.driver(driver(1))).offer!.id, 'accept', 'accept');
    let view = decodeMatchingTrip(await f.c.fetch(p, trip.id)); const id = view.assignment!.id;
    assert.deepEqual(view.assignment!.sample.coordinate, [.2, .2]);
    assert.equal(view.assignment!.sample.capturedAt, f.clock.now());
    const signal = f.c.wait(p, trip.id, view.revision);
    f.clock.advance(5000);
    await f.c.location(driver(1), [.2002, .2], 90, 'moving');
    assert.ok((await signal).revision > view.revision);
    view = decodeMatchingTrip(await f.c.fetch(p, trip.id));
    assert.deepEqual(view.assignment!.sample.coordinate, [.2002, .2]);
    assert.equal(view.assignment!.sample.heading, 90);
    assert.equal(view.assignment!.sample.headingKnown, true);
    await assert.rejects(f.c.fetch(other, trip.id), /forbidden/);
    await f.c.lifecycleCommand(driver(1), trip.id, id, 'arrive', { name: 'arrive' });
    f.clock.advance(5000); await f.c.location(driver(1), [.2002, .2001], undefined, 'pickup');
    view = await f.c.fetch(p, trip.id); assert.equal(view.requestState, 'ARRIVED_PICKUP');
    assert.deepEqual(view.assignment!.sample.coordinate, [.2002, .2001]);
    await f.c.lifecycleCommand(driver(1), trip.id, id, 'start', { name: 'start', pin: view.assignment!.pin });
    f.clock.advance(5000);
    const sample = { coordinate: [.2004, .2003] as const, capturedAt: f.clock.now(), sequence: 1 };
    await f.c.telemetry(driver(1), trip.id, id, sample);
    view = decodeMatchingTrip(await f.c.fetch(p, trip.id));
    assert.equal(view.requestState, 'IN_PROGRESS'); assert.deepEqual(view.assignment!.sample.coordinate, sample.coordinate);
    assert.ok(Math.abs(view.assignment!.sample.heading - 45) < .01);
    const revision = view.revision; const sequence = view.assignment!.sample.sequence;
    await f.c.telemetry(driver(1), trip.id, id, sample); // idempotent, no new location/revision
    assert.equal((await f.c.fetch(p, trip.id)).revision, revision);
    await f.restart();
    assert.deepEqual(decodeMatchingTrip(await f.c.fetch(p, trip.id)), view);
    const restored = decodeDriver(await f.c.driver(driver(1)));
    assert.deepEqual(restored.assignment!.value.sample, view.assignment!.sample);
    // New live fix may overtake the durable offline journal. Replayed telemetry still meters,
    // but never moves either phone back to the older position.
    f.clock.advance(5000); const replayAt = f.clock.now();
    f.clock.advance(5000); await f.c.location(driver(1), [.2006, .2005], 45, 'newer-live');
    const live = (await f.c.fetch(p, trip.id)).assignment!.sample;
    await f.c.telemetry(driver(1), trip.id, id, { coordinate: [.2005, .2004], capturedAt: replayAt, sequence: 2 });
    const afterReplay = await f.c.fetch(p, trip.id);
    assert.deepEqual(afterReplay.assignment!.sample, live);
    assert.ok(live.sequence > sequence); assert.equal(afterReplay.lifecycle.meter!.lastSequence, 2);
    assert.ok(afterReplay.lifecycle.meter!.distanceMeters > 0);
    await f.restart(); assert.deepEqual((await f.c.fetch(p, trip.id)).assignment!.sample, live);
  } finally { f.close(); }
});

test('unknown course is explicit, metadata is validated, legacy snapshots remain readable', async () => {
  const f = setup(1);
  try {
    await f.ready(); await f.available(1); const trip = await f.c.create(p, 'quote', 'create'); await flush();
    await f.c.offerAction(driver(1), (await f.c.driver(driver(1))).offer!.id, 'accept', 'accept');
    const view = await f.c.fetch(p, trip.id);
    assert.equal(view.assignment!.sample.headingKnown, false); // pickup route is not actual travel direction
    assert.equal((await f.c.driver(driver(1))).location!.heading, undefined);
    for (const metadata of [{ capturedAt: -1 }, { capturedAt: NaN }, { headingKnown: 'yes' }]) {
      const invalid = structuredClone(view); Object.assign(invalid.assignment!.sample, metadata);
      assert.throws(() => decodeMatchingTrip(invalid), /Invalid matching/);
    }
    const legacy = structuredClone(view);
    delete (legacy.assignment!.sample as { capturedAt?: number }).capturedAt;
    delete (legacy.assignment!.sample as { headingKnown?: boolean }).headingKnown;
    assert.doesNotThrow(() => decodeMatchingTrip(legacy));
    const sample = { coordinate: [0, 0], capturedAt: 1000, sequence: 1 };
    assert.deepEqual(parseTelemetry(sample), sample);
    assert.equal(parseTelemetry({ ...sample, heading: 359 }).heading, 359);
    for (const heading of [-1, 360, NaN, null, '90']) assert.throws(() => parseTelemetry({ ...sample, heading }), /invalid_telemetry/);
  } finally { f.close(); }
});
