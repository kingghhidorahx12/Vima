import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setup, p, other, driver, flush } from './support/lifecycle-fixture.ts';
import { MatchingCoordinator } from '../gateway/matching/coordinator.ts';
import { syntheticPricing } from './support/pricing-fixture.ts';
import { priceTrip } from '../gateway/pricing/engine.ts';
import { canonical, fingerprint } from '../gateway/matching/lifecycle.ts';
import { decodeDriver, decodeMatchingTrip } from '../src/services/matching/decode.ts';
import type { LifecycleCommand } from '../src/services/matching/lifecycle.ts';
import { distanceMeters } from '../src/services/geospatial/placeIdentity.ts';

async function assigned(f: ReturnType<typeof setup>) {
  await f.ready(); await f.available(1); const trip = await f.c.create(p, 'quote', 'create'); await flush();
  await f.c.offerAction(driver(1), (await f.c.driver(driver(1))).offer!.id, 'accept', 'accept');
  const a = (await f.c.fetch(p, trip.id)).assignment!;
  let sequence = 0;
  return { id: trip.id, a, get: () => f.c.fetch(p, trip.id),
    command: (command: LifecycleCommand, id = `command-${++sequence}`) => f.c.lifecycleCommand(driver(1), trip.id, a.id, id, command),
    sample: (seq: number, coordinate: readonly [number, number] = [0.2, 0.2]) =>
      f.c.telemetry(driver(1), trip.id, a.id, { sequence: seq, coordinate, capturedAt: f.clock.now() }),
    async arrive() { await f.c.location(driver(1), [0.2, 0.2], 0, 'pickup-fix');
      return f.c.lifecycleCommand(driver(1), trip.id, a.id, 'arrive', { name: 'arrive' }); },
    async start() { await this.arrive(); return this.command({ name: 'start', pin: a.pin }, 'start'); },
  };
}

test('lifecycle persists each stage; normal is exact quote; PIN absent Driver; cash dispute durable', async () => {
  const f = setup(1); try {
    const t = await assigned(f); const quote = f.quotes.get('quote')!.quote;
    decodeDriver(await f.c.driver(driver(1))); assert.ok(t.a.pin);
    assert.equal('pin' in (await f.c.driver(driver(1))).assignment!.value, false);
    await assert.rejects(t.command({ name: 'arrive' }), /pickup_location_required/);
    await t.arrive(); await f.restart(); assert.equal((await t.get()).requestState, 'ARRIVED_PICKUP');
    const revision = (await t.get()).revision;
    await assert.rejects(t.command({ name: 'start', pin: t.a.pin === '0000' ? '1111' : '0000' }), /incorrect_pin/);
    assert.equal((await t.get()).revision, revision);
    const started = await t.command({ name: 'start', pin: t.a.pin }, 'start');
    assert.deepEqual(await t.command({ name: 'start', pin: t.a.pin }, 'start'), started);
    await f.restart(); assert.equal((await t.get()).requestState, 'IN_PROGRESS');
    await assert.rejects(f.c.cancel(p, t.id, 'cancel', 'user', t.a.id), /request_not_cancellable/);
    await assert.rejects(f.c.cancelAssignment(driver(1), t.id, 'cancel-driver', t.a.id), /request_not_cancellable/);
    await assert.rejects(t.command({ name: 'finish', kind: 'normal', finalTelemetrySequence: 1 }), /final_telemetry_not_confirmed/);
    await t.sample(1); f.clock.advance(12000); await t.sample(2, [0.201, 0.2]);
    const final = await t.command({ name: 'finish', kind: 'normal', finalTelemetrySequence: 2 }, 'finish');
    assert.equal(JSON.stringify(final.assignment!.lifecycle.settlement!.price), JSON.stringify(quote.price));
    assert.equal(final.assignment!.lifecycle.meter!.durationSeconds, 12);
    await f.restart(); assert.equal((await f.c.activeRequest(p))?.requestState, 'PAYMENT_PENDING');
    assert.equal((await f.c.driver(driver(1))).availability, 'ASSIGNED');
    assert.deepEqual(await t.command({ name: 'finish', kind: 'normal', finalTelemetrySequence: 2 }, 'finish'), final);
    await assert.rejects(t.sample(3), /invalid_trip_state/);
    const paid = await t.command({ name: 'cash_problem' }, 'payment');
    const receipt = decodeMatchingTrip(await t.get()); assert.equal(receipt.requestState, 'COMPLETED');
    assert.ok(receipt.lifecycle.disputeId); assert.equal(await f.c.activeRequest(p), null);
    assert.equal(paid.lastTrip?.lifecycle.disputeId, receipt.lifecycle.disputeId);
    await f.restart(); assert.deepEqual(await t.command({ name: 'cash_problem' }, 'payment'), paid);
    await assert.rejects(t.command({ name: 'cash_received' }), /invalid_trip_state/);
    assert.equal((await t.get()).lifecycle.disputeId, receipt.lifecycle.disputeId);
    assert.doesNotMatch(JSON.stringify(f.traces), /pin|coordinate|telemetry/);
  } finally { f.close(); }
});

test('telemetry consecutive, duplicate fingerprint, timestamps and geodesic accumulation', async () => {
  const f = setup(1); try {
    const t = await assigned(f); await t.start();
    await assert.rejects(t.sample(2), /telemetry_gap/);
    const first = await t.sample(1); assert.deepEqual(await t.sample(1), first);
    await assert.rejects(t.sample(1, [1, 1]), /telemetry_conflict/);
    await assert.rejects(f.c.telemetry(driver(1), t.id, t.a.id, { sequence: 2, coordinate: [0, 0], capturedAt: f.clock.now() + 1 }), /invalid_telemetry_time/);
    f.clock.advance(2000); await t.sample(2, [0.2, 0.201]); f.clock.advance(3000); await t.sample(3, [0.2, 0.202]);
    const meter = (await t.get()).lifecycle.meter!;
    assert.equal(meter.durationSeconds, 5); assert.equal(meter.distanceMeters, 222); assert.equal(meter.lastSequence, 3);
    assert.ok(Math.abs(distanceMeters([0, 0], [0, 1]) - 111194.9266) < 0.01);
    await f.restart(); assert.deepEqual((await t.get()).lifecycle.meter, meter);
    await assert.rejects(t.command({ name: 'finish', kind: 'early', finalTelemetrySequence: 2 }), /final_telemetry_not_confirmed/);
    await assert.rejects(t.command({ name: 'finish', kind: 'early', finalTelemetrySequence: 4 }), /final_telemetry_not_confirmed/);
  } finally { f.close(); }
});

for (const first of ['start', 'no_show', 'passenger_cancel', 'driver_cancel'] as const) test(`pre-PIN race ${first} first, persisted no-show wait`, async () => {
  const f = setup(1); try {
    const t = await assigned(f); await t.arrive();
    await assert.rejects(t.command({ name: 'no_show' }), /no_show_not_available/);
    f.clock.advance(300000); await f.restart();
    const actions = {
      start: () => t.command({ name: 'start', pin: t.a.pin }), no_show: () => t.command({ name: 'no_show' }),
      passenger_cancel: () => f.c.cancel(p, t.id, 'cancel-p', 'user', t.a.id),
      driver_cancel: () => f.c.cancelAssignment(driver(1), t.id, 'cancel-d', t.a.id),
    };
    const results = await Promise.allSettled([actions[first](), actions[first === 'start' ? 'no_show' : 'start']()]);
    assert.equal(results[0]!.status, 'fulfilled'); assert.equal(results[1]!.status, 'rejected');
    assert.equal((await t.get()).requestState, first === 'start' ? 'IN_PROGRESS' : first === 'driver_cancel' ? 'SEARCHING' : 'CANCELLED');
    await f.restart();
  } finally { f.close(); }
});

for (const actor of ['driver', 'passenger'] as const) for (const arriveFirst of [true, false]) test(`arrive/cancel ${actor} arrive first=${arriveFirst}`, async () => {
  const f = setup(1); try {
    const t = await assigned(f); await f.c.location(driver(1), [0.2, 0.2], 0, 'pickup');
    const arrive = () => t.command({ name: 'arrive' });
    const cancel = () => actor === 'driver' ? f.c.cancelAssignment(driver(1), t.id, 'cancel', t.a.id) : f.c.cancel(p, t.id, 'cancel', 'user', t.a.id);
    const results = await Promise.allSettled(arriveFirst ? [arrive(), cancel()] : [cancel(), arrive()]);
    assert.equal(results[0]!.status, 'fulfilled'); assert.equal(results[1]!.status, arriveFirst ? 'fulfilled' : 'rejected');
    assert.equal((await t.get()).requestState, actor === 'driver' ? 'SEARCHING' : 'CANCELLED');
  } finally { f.close(); }
});

test('stale assignment fenced; stops strictly ordered with stable receipts; normal finish gated', async () => {
  const f = setup(1); try {
    const q = f.quotes.get('quote')!.quote; q.stops = [q.destination, q.destination];
    const t = await assigned(f); await t.start(); await t.sample(1);
    await assert.rejects(f.c.lifecycleCommand(driver(1), t.id, 'obsolete', 'stale', { name: 'complete_stop', stopIndex: 0 }), /stale_assignment/);
    await assert.rejects(f.c.cancelAssignment(driver(1), t.id, 'stale-cancel', 'obsolete'), /stale_assignment/);
    await assert.rejects(t.command({ name: 'complete_stop', stopIndex: 1 }), /stop_out_of_order/);
    const zero = await t.command({ name: 'complete_stop', stopIndex: 0 }, 'stop-0');
    assert.deepEqual(await t.command({ name: 'complete_stop', stopIndex: 0 }, 'stop-0'), zero);
    await assert.rejects(t.command({ name: 'finish', kind: 'normal', finalTelemetrySequence: 1 }), /stops_pending/);
    await t.command({ name: 'complete_stop', stopIndex: 1 }); await f.restart();
    await t.command({ name: 'finish', kind: 'normal', finalTelemetrySequence: 1 });
  } finally { f.close(); }
});

for (const kind of ['normal', 'early'] as const) test(`concurrent finish/payment first=${kind}`, async () => {
  const f = setup(1); try {
    const t = await assigned(f); await t.start(); await t.sample(1);
    const results = await Promise.allSettled([t.command({ name: 'finish', kind, finalTelemetrySequence: 1 }),
      t.command({ name: 'finish', kind: kind === 'early' ? 'normal' : 'early', finalTelemetrySequence: 1 }), t.sample(2)]);
    assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected', 'rejected']);
    const first = kind === 'normal' ? 'cash_received' : 'cash_problem';
    const payments = await Promise.allSettled([t.command({ name: first }, 'cash'), t.command({ name: first === 'cash_received' ? 'cash_problem' : 'cash_received' })]);
    assert.deepEqual(payments.map(r => r.status), ['fulfilled', 'rejected']);
    assert.equal((await t.get()).lifecycle.paymentOutcome, first);
    await f.restart(); assert.equal((await t.get()).lifecycle.paymentOutcome, first);
  } finally { f.close(); }
});

test('early frozen profile/override + real meter + incurred only; minimum and no cap; config mutation cannot reprice', async () => {
  for (const huge of [false, true]) {
    const config = syntheticPricing(); config.profiles.REGIONAL.additions = [{ code: 'toll', kind: 'toll', label: 'Test toll', amountMinor: 100 }];
    config.intermunicipalOverrides = [{ id: 'corridor', fromRegionId: 'region-0', toRegionId: 'region-1', direction: 'both', rateOverride: { minimumMinor: 900 },
      additions: [{ code: 'extra', kind: 'extra', label: 'Test extra', amountMinor: 300 }] }];
    const f = setup(1, undefined, config); try {
      const quote = f.quotes.get('quote')!.quote; quote.profile = 'REGIONAL'; quote.overrideId = 'corridor';
      quote.price = priceTrip({ config, profile: quote.profile, routeMetrics: quote.route, adjustments: config.intermunicipalOverrides[0] }).price;
      const t = await assigned(f); await t.start(); await t.sample(1);
      await assert.rejects(t.command({ name: 'incur_addition', code: 'unknown' }), /unknown_addition/);
      const incurred = await t.command({ name: 'incur_addition', code: 'toll' }, 'incurred');
      assert.deepEqual(await t.command({ name: 'incur_addition', code: 'toll' }, 'incurred'), incurred);
      if (huge) { f.clock.advance(1000000); await t.sample(2, [1.2, 1.2]); }
      f.options.pricingConfig.profiles.REGIONAL.baseMinor = 999999; await f.restart();
      await t.command({ name: 'finish', kind: 'early', finalTelemetrySequence: huge ? 2 : 1 });
      const settlement = (await t.get()).lifecycle.settlement!;
      assert.deepEqual(settlement.price.extras.map(e => e.code), ['toll']);
      assert.equal(settlement.profile, 'REGIONAL'); assert.equal(settlement.overrideId, 'corridor');
      if (huge) assert.ok(settlement.price.totalMinor > quote.price.totalMinor);
      else { assert.equal(settlement.price.minimumApplied, true); assert.equal(settlement.price.totalMinor, 1000); }
      const expected = structuredClone(config); expected.intermunicipalOverrides[0]!.additions = [];
      assert.deepEqual(settlement.price, priceTrip({ config: expected, profile: 'REGIONAL', routeMetrics: settlement.metrics, adjustments: expected.intermunicipalOverrides[0] }).price);
      await f.restart(); assert.deepEqual((await t.get()).lifecycle.settlement, settlement);
    } finally { f.close(); }
  }
});

test('telemetry before finish and addition/finish races commit in serialized order', async () => {
  for (const additionFirst of [true, false]) {
    const config = syntheticPricing(); config.profiles.URBANO.additions = [{ code: 'extra', kind: 'extra', label: 'Extra', amountMinor: 300 }];
    const f = setup(1, undefined, config); try {
      const t = await assigned(f); await t.start();
      const sample = t.sample(1); const add = () => t.command({ name: 'incur_addition', code: 'extra' });
      const finish = () => t.command({ name: 'finish', kind: 'early', finalTelemetrySequence: 1 });
      const result = await Promise.allSettled([sample, ...(additionFirst ? [add(), finish()] : [finish(), add()])]);
      assert.equal(result[0]!.status, 'fulfilled'); assert.equal(result[1]!.status, 'fulfilled');
      assert.equal(result[2]!.status, additionFirst ? 'fulfilled' : 'rejected');
      assert.equal((await t.get()).lifecycle.settlement!.price.extras.length, additionFirst ? 1 : 0);
    } finally { f.close(); }
  }
});

test('v4 basis fingerprint content identity; legacy migration proves equivalence, rejects changed rates/profile/override/version', async () => {
  const config = syntheticPricing(); const changed = structuredClone(config); changed.profiles.URBANO.minimumMinor++;
  assert.notEqual(fingerprint(config), fingerprint(changed)); assert.equal(fingerprint(config), fingerprint(JSON.parse(canonical(config))));
  for (const mode of ['equivalent', 'rate', 'version', 'profile', 'override', 'missing', 'terminal'] as const) {
    const f = setup(1); try {
      const t = await assigned(f); if (mode === 'terminal') await f.c.cancel(p, t.id, 'cancel', 'user', t.a.id);
      f.c.close(); const path = join(f.directory, 'matching-v1.json'); const raw = JSON.parse(readFileSync(path, 'utf8'));
      raw.version = 3; delete raw.pricingBases;
      for (const d of Object.values(raw.drivers)) delete (d as Record<string, unknown>).lastTerminalRequestId;
      for (const a of Object.values(raw.actions)) { const d = (a as { result: { driver?: Record<string, unknown> } }).result.driver; if (d) delete d.lastTerminalRequestId; }
      for (const r of [...Object.values(raw.requests), ...Object.values(raw.actions).map(a => (a as { result: { request?: unknown } }).result.request)]) {
        if (r) { delete (r as Record<string, unknown>).pricingBasisId; delete (r as Record<string, unknown>).lifecycle; }
      }
      if (mode === 'terminal') { delete raw.requests[t.id].assignment; f.options.pricingConfig.version = 'different'; }
      if (mode === 'rate') f.options.pricingConfig.profiles.URBANO.baseMinor++;
      if (mode === 'version') f.options.pricingConfig.version = 'different';
      if (mode === 'profile') raw.requests[t.id].quote.profile = 'REGIONAL';
      if (mode === 'override') raw.requests[t.id].quote.overrideId = 'missing';
      writeFileSync(path, JSON.stringify(raw));
      if (mode === 'missing') { assert.throws(() => new MatchingCoordinator({ ...f.options, pricingConfig: undefined }), /invalid_matching_snapshot/); continue; }
      if (mode === 'equivalent' || mode === 'terminal') {
        await f.restart(); assert.equal(JSON.parse(readFileSync(path, 'utf8')).version, 4);
        if (mode === 'equivalent') assert.equal((await t.get()).assignment!.id, t.a.id);
      } else await assert.rejects(f.restart(), /invalid_matching_snapshot/);
    } finally { f.close(); }
  }
});

test('pricing bases deduplicate content across owners; same version with changed content gets another durable basis', async () => {
  const f = setup(0); try {
    await f.ready(); const first = await f.c.create(p, 'quote', 'first'); f.addQuote('other', other.accountId);
    await f.c.create(other, 'other', 'other');
    const path = join(f.directory, 'matching-v1.json');
    const shared = JSON.parse(readFileSync(path, 'utf8')); assert.equal(Object.keys(shared.pricingBases).length, 1);
    assert.equal(new Set(Object.values(shared.requests).map(r => (r as { pricingBasisId: string }).pricingBasisId)).size, 1);
    await f.c.cancel(p, first.id, 'cancel', 'user');
    f.options.pricingConfig.profiles.URBANO.baseMinor += 50;
    const quote = f.addQuote('changed'); quote.price = priceTrip({ config: f.options.pricingConfig, profile: quote.profile, routeMetrics: quote.route }).price;
    await f.c.create(p, 'changed', 'changed');
    const changed = JSON.parse(readFileSync(path, 'utf8')); assert.equal(Object.keys(changed.pricingBases).length, 2);
    await f.restart();
  } finally { f.close(); }
});

test('latest terminal receipt is linked by commit, including equal-clock completions', async () => {
  const f = setup(1); try {
    const first = await assigned(f); await first.start(); await first.sample(1);
    await first.command({ name: 'finish', kind: 'normal', finalTelemetrySequence: 1 }); await first.command({ name: 'cash_problem' });
    await f.c.location(driver(1), [0.201, 0.2], 0, 'second-location');
    f.addQuote('second'); const second = await f.c.create(p, 'second', 'second'); await flush();
    await f.c.offerAction(driver(1), (await f.c.driver(driver(1))).offer!.id, 'accept', 'accept-second');
    const a = (await f.c.fetch(p, second.id)).assignment!;
    const cmd = (id: string, c: LifecycleCommand) => f.c.lifecycleCommand(driver(1), second.id, a.id, id, c);
    await cmd('arrive-second', { name: 'arrive' }); await cmd('start-second', { name: 'start', pin: a.pin });
    await f.c.telemetry(driver(1), second.id, a.id, { sequence: 1, coordinate: [0.2, 0.2], capturedAt: f.clock.now() });
    await cmd('finish-second', { name: 'finish', kind: 'normal', finalTelemetrySequence: 1 });
    const paid = await cmd('cash-second', { name: 'cash_received' }); assert.equal(paid.lastTrip?.requestId, second.id);
    await f.restart(); assert.equal((await f.c.driver(driver(1))).lastTrip?.requestId, second.id);
  } finally { f.close(); }
});
