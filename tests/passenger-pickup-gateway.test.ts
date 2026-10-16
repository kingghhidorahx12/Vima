import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuoteService } from '../gateway/pricing/service.ts';
import { gatewayConfig } from '../gateway/config.ts';
import type { TomTomAdapter, UpstreamContext } from '../gateway/tomtom.ts';
import { syntheticDraft, syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';
import { withinPickupArea, pickupDistanceMeters } from '../src/services/geospatial/pickup.ts';
import { decodeQuoteResponse } from '../src/services/pricing/normalize.ts';
import { productDriverFixture } from './support/product-driver-fixture.ts';
import { ApiError } from '../src/services/api/client.ts';
import { decodeMatchingTrip } from '../src/services/matching/decode.ts';

const north = (meters: number) => [0.2, 0.2 + meters / 6371000 * 180 / Math.PI] as const;
const ctx: UpstreamContext = { signal: new AbortController().signal };
const draftAt = (meters: number) => ({ ...syntheticDraft, referenceOrigin: syntheticDraft.origin,
  origin: { ...syntheticDraft.origin, id: `pickup-${meters}`, coordinate: north(meters) } });

test('A pickup geodesic boundaries 0/199/200/201, invalid coordinates and configurable independent limit', async () => {
  let routes = 0;
  const service = createQuoteService({ route: async () => { routes++; return syntheticRoute; } } as unknown as TomTomAdapter,
    gatewayConfig({}), { status: 'ready', config: syntheticPricing() });
  for (const meters of [0, 199, 200]) {
    assert.ok(withinPickupArea(syntheticDraft.origin.coordinate, north(meters)));
    assert.ok(Math.abs(pickupDistanceMeters(syntheticDraft.origin.coordinate, north(meters)) - meters) < 1e-7);
    const response = decodeQuoteResponse(await service.quote({ ...draftAt(meters), operationId: `pickup-boundary-${meters}` }, ctx));
    assert.equal(response.status, 'priced');
    if (response.status !== 'priced') throw Error('expected priced');
    assert.deepEqual(response.quote.origin.coordinate, north(meters));
    assert.equal(!!response.quote.referenceOrigin, meters > 0);
  }
  assert.equal(withinPickupArea(syntheticDraft.origin.coordinate, north(201)), false);
  await assert.rejects(service.quote({ ...draftAt(201), operationId: 'pickup-outside-201' }, ctx), /pickup_outside_area/);
  assert.equal(routes, 3);
  for (const coordinate of [[NaN, 0], [0, 91], [181, 0], [0], ['0', 0]]) {
    await assert.rejects(service.quote({ ...draftAt(1), referenceOrigin: { ...syntheticDraft.origin, coordinate }, operationId: 'pickup-invalid-point' }, ctx));
  }
  const limited = createQuoteService({ route: async () => syntheticRoute } as unknown as TomTomAdapter,
    gatewayConfig({ VIMA_PICKUP_ADJUSTMENT_MAX_METERS: '100' }), { status: 'ready', config: syntheticPricing() });
  await assert.rejects(limited.quote({ ...draftAt(199), operationId: 'pickup-limit-override' }, ctx), /pickup_outside_area/);
  assert.throws(() => gatewayConfig({ VIMA_PICKUP_ADJUSTMENT_MAX_METERS: '0' }));
  // Initial selection has no radius restriction: arbitrary supported reference may be chosen.
  assert.equal((await service.quote({ ...syntheticDraft, origin: { ...syntheticDraft.origin, coordinate: north(500) }, operationId: 'pickup-free-initial' }, ctx)).status, 'priced');
});

test('A reference coverage and real routing are authoritative; replay/conflict/old quotes stay compatible', async () => {
  const calls: unknown[] = []; let fail = false;
  const adapter = { route: async (input: unknown) => { calls.push(input); if (fail) throw Error('no roads'); return syntheticRoute; } } as unknown as TomTomAdapter;
  const service = createQuoteService(adapter, { ...gatewayConfig({}), serviceAreaBounds: [0.199, 0.199, 1, 1] }, { status: 'ready', config: syntheticPricing() });
  const a = { ...draftAt(199), operationId: 'pickup-same-operation' };
  const [first, second] = await Promise.all([service.quote(a, ctx), service.quote(a, ctx)]);
  assert.deepEqual(first, second); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { origin: north(199), destination: syntheticDraft.destination.coordinate, stops: [] });
  await assert.rejects(service.quote({ ...a, origin: draftAt(100).origin }, ctx), /idempotency_conflict/);
  const uncovered = await service.quote({ ...syntheticDraft,
    origin: { ...syntheticDraft.origin, coordinate: [0.0005, 0.2] },
    referenceOrigin: { ...syntheticDraft.origin, coordinate: [-0.0001, 0.2] }, operationId: 'pickup-outside-coverage' }, ctx);
  assert.equal(uncovered.status, 'unpriced');
  if (uncovered.status === 'unpriced') assert.equal(uncovered.reason, 'pricing_unavailable');
  assert.equal(calls.length, 2); // Real route preview is allowed, but no commercial quote outside pricing coverage.
  fail = true;
  await assert.rejects(service.quote({ ...a, operationId: 'pickup-no-mapped-roads' }, ctx), /route_unavailable/);
  fail = false;
  assert.equal((await service.quote({ ...a, operationId: 'pickup-no-mapped-roads' }, ctx)).status, 'priced');
  const old = decodeQuoteResponse(await service.quote({ ...syntheticDraft, operationId: 'pickup-old-no-reference' }, ctx));
  assert.equal(old.status, 'priced'); if (old.status === 'priced') assert.equal('referenceOrigin' in old.quote, false);
});

test('contribution bounds never restrict historical, adjusted or intermunicipal commercial quotes', async () => {
  for (const regional of [false, true]) for (const meters of [0, 199, 200]) {
    const input = { ...draftAt(meters), operationId: `bounds-independent-${regional}-${meters}`,
      destination: { ...syntheticDraft.destination, coordinate: regional ? [2.2, 0.2] : syntheticDraft.destination.coordinate } };
    if (!meters) delete (input as { referenceOrigin?: unknown }).referenceOrigin; // Historical contract.
    const responses = [];
    for (const bounds of [undefined, [0.1999, 0.1999, 0.2001, 0.2001] as const]) {
      const service = createQuoteService({ route: async () => syntheticRoute } as unknown as TomTomAdapter,
        { ...gatewayConfig({}), serviceAreaBounds: bounds }, { status: 'ready', config: syntheticPricing() });
      const response = await service.quote(input, ctx);
      assert.equal(response.status, 'priced'); if (response.status !== 'priced') throw Error('expected priced');
      responses.push(response.quote);
    }
    assert.equal(responses[0]!.profile, regional ? 'REGIONAL' : 'URBANO');
    assert.equal(responses[1]!.profile, responses[0]!.profile);
    assert.deepEqual(responses[1]!.price, responses[0]!.price);
    assert.deepEqual(responses[1]!.route, responses[0]!.route);
  }
});

test('A product HTTP pickup is identical in Passenger/offer/assignment; arrival remains 150m, survives restart', async () => {
  const f = await productDriverFixture();
  try {
    await f.admin('approve');
    const trip = await f.request(draftAt(199)); const offer = await f.offer(); const dm = f.driver.matching('driver');
    assert.deepEqual(offer.pickup.coordinate, north(199));
    await dm.offerAction(offer.id, 'accept', 'pickup-accept');
    const snapshot = decodeMatchingTrip(await f.passenger.matching('passenger').fetch(trip.id));
    assert.deepEqual(snapshot.quote.referenceOrigin!.coordinate, syntheticDraft.origin.coordinate);
    assert.deepEqual(snapshot.quote.origin.coordinate, (await dm.driver()).assignment!.pickup.coordinate);
    const a = snapshot.assignment!;
    assert.deepEqual(f.routeCalls[0]!.origin, north(199));
    assert.deepEqual(f.routeCalls.at(-1)!.destination, north(199));
    assert.equal(a.routeToOrigin.geometry.type, 'LineString');
    if (a.routeToOrigin.geometry.type === 'LineString') assert.deepEqual(a.routeToOrigin.geometry.coordinates.at(-1), north(199));
    // The driver at the reference origin is 199m from the effective pickup, not arrived.
    await assert.rejects(dm.lifecycleCommand(trip.id, a.id, 'pickup-too-far', { name: 'arrive' }),
      (e: unknown) => e instanceof ApiError && e.code === 'pickup_location_required');
    await dm.location(north(199), 0, 'pickup-arrival-location');
    await dm.lifecycleCommand(trip.id, a.id, 'pickup-arrive', { name: 'arrive' });
    await f.restart();
    const restored = await f.passenger.matching('passenger').activeRequest();
    assert.deepEqual(restored!.quote.referenceOrigin, snapshot.quote.referenceOrigin);
    assert.deepEqual((await dm.driver()).assignment!.pickup.coordinate, north(199));
    assert.equal(restored!.requestState, 'ARRIVED_PICKUP');
    await assert.rejects(f.passenger.auth.api.request({ path: '/v1/passenger/quotes', method: 'POST',
      body: { ...draftAt(201), operationId: 'pickup-tampered-server' }, decode: value => value }),
      (e: unknown) => e instanceof ApiError && e.status === 400 && e.code === 'pickup_outside_area');
  } finally { await f.close(); }
});
