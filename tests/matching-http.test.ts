import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createGateway } from '../gateway/server.ts';
import { gatewayConfig } from '../gateway/config.ts';
import { createAuthConfig } from '../gateway/matching/auth.ts';
import type { TomTomAdapter } from '../gateway/tomtom.ts';
import { syntheticDraft, syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';
import { createApiClient } from '../src/services/api/client.ts';
import { decodeMatchingTrip, decodeDriver } from '../src/services/matching/decode.ts';

test('authenticated HTTP pricing → request → offer → assignment uses ownership, real adapters and scoped reads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vima-matching-http-'));
  const tokens = Array.from({ length: 4 }, () => randomBytes(32).toString('hex'));
  const auth = createAuthConfig({ accounts: [
    { accountId: 'passenger', role: 'passenger', token: tokens[0] }, { accountId: 'other', role: 'passenger', token: tokens[1] },
    ...[2, 3].map(i => ({ accountId: `driver-${i}`, role: 'driver', token: tokens[i], driver: { name: `Synthetic ${i}`, rating: 4.8 },
      vehicle: { name: 'Synthetic', plate: 'TEST', color: 'White' } })),
  ] });
  const logs: unknown[] = [];
  const adapter = { route: async () => syntheticRoute } as unknown as TomTomAdapter;
  const config = { ...gatewayConfig({}), runtimeDir: directory, rateLimit: 1000 };
  const options = { auth, configured: true, pricing: { status: 'ready' as const, config: syntheticPricing() }, logger: (entry: unknown) => logs.push(entry),
    matchingTrace: (entry: unknown) => logs.push(entry) };
  let server = createGateway(config, adapter, options);
  const listen = async () => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${(server.address() as AddressInfo).port}`; };
  let base = await listen();
  // Synthetic ephemeral credentials exercise the server on loopback. The mobile API guard is tested separately below.
  const call = async (path: string, index: number | undefined, body?: unknown) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      ...(index === undefined ? {} : { Authorization: `Bearer ${tokens[index]}` }), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await call('/v1/driver/state', undefined)).status, 401);
    assert.equal((await call('/v1/driver/state', 0)).status, 403);
    assert.equal((await call('/v1/matching/session', 0)).body.matchingAvailable, true);
    assert.deepEqual(await call('/v1/passenger/requests/active', 0), { status: 200, body: null });
    assert.equal((await call('/v1/passenger/requests/active', undefined)).status, 401);
    assert.equal((await call('/v1/passenger/requests/active', 2)).status, 403);
    assert.equal((await call('/v1/passenger/requests/active?owner=other', 0)).status, 400);
    const quote = (await call('/v1/passenger/quotes', 0, { ...syntheticDraft, operationId: 'http-quote-operation' })).body;
    assert.equal(quote.status, 'priced');
    assert.equal((await call('/v1/passenger/requests', 1, { quoteId: quote.quote.id, requestId: 'foreign' })).status, 409);
    assert.equal((await call('/v1/passenger/quotes', 2, { ...syntheticDraft, operationId: 'driver-quote-operation' })).status, 403);
    const unowned = (await call('/v1/passenger/quotes', undefined, { ...syntheticDraft, operationId: 'anonymous-operation' })).body;
    assert.equal((await call('/v1/passenger/requests', 0, { quoteId: unowned.quote.id, requestId: 'unowned' })).status, 409);
    await call('/v1/driver/availability', 2, { availability: 'AVAILABLE', operationId: 'available' });
    await call('/v1/driver/location', 2, { coordinate: [0.2, 0.2], heading: 90, operationId: 'location' });
    assert.equal((await call('/v1/driver/location', 2, { coordinate: [500, 500], operationId: 'bad-location' })).status, 400);
    const created = await call('/v1/passenger/requests', 0, { quoteId: quote.quote.id, requestId: 'create' });
    const trip = decodeMatchingTrip(created.body); assert.equal(trip.phase, 'searching');
    assert.equal((await call('/v1/passenger/requests/active', 0)).body.id, trip.id);
    assert.deepEqual(await call('/v1/passenger/requests/active', 1), { status: 200, body: null });
    const duplicate = await call('/v1/passenger/requests', 0, { quoteId: quote.quote.id, requestId: 'second-id' });
    assert.equal(duplicate.status, 409); assert.match(JSON.stringify(duplicate.body), /active_request_exists/);
    assert.equal((await call(`/v1/passenger/requests/${trip.id}`, 1)).status, 403);
    assert.equal((await call(`/v1/passenger/requests/${trip.id}/changes?afterRevision=0`, 1)).status, 403);
    assert.equal((await call('/v1/driver/availability', 2, { availability: 'AVAILABLE', operationId: 'bad', accountId: 'forged' })).status, 400);
    let driver = decodeDriver((await call('/v1/driver/state', 2)).body);
    if (!driver.offer) { for (let i = 0; i < 10; i++) await new Promise<void>(resolve => setImmediate(resolve)); driver = decodeDriver((await call('/v1/driver/state', 2)).body); }
    assert.ok(driver.offer);
    assert.equal((await call(`/v1/driver/offers/${driver.offer.id}/accept`, 3, { actionId: 'foreign-accept' })).status, 403);
    const accepted = decodeDriver((await call(`/v1/driver/offers/${driver.offer.id}/accept`, 2, { actionId: 'accept' })).body);
    const passenger = decodeMatchingTrip((await call(`/v1/passenger/requests/${trip.id}`, 0)).body);
    assert.equal(accepted.assignment?.value.id, passenger.assignment?.id);
    assert.equal(passenger.assignment?.sample.heading, 90);
    assert.equal((await call(`/v1/passenger/requests/${trip.id}/commands`, 0, { tripId: trip.id, commandId: 'cancel-after', name: 'cancel', payload: { reason: 'user' } })).status, 409);
    await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
    server = createGateway(config, adapter, options); base = await listen();
    assert.equal(decodeMatchingTrip((await call(`/v1/passenger/requests/${trip.id}`, 0)).body).assignment?.id, passenger.assignment?.id);
    assert.equal(decodeMatchingTrip((await call('/v1/passenger/requests', 0, { quoteId: quote.quote.id, requestId: 'create' })).body).id, trip.id);
    await call(`/v1/driver/assignments/${trip.id}/cancel`, 2, { actionId: 'cancel-driver' });
    await call(`/v1/passenger/requests/${trip.id}/commands`, 0, { tripId: trip.id, commandId: 'cancel-new', name: 'cancel', payload: { reason: 'user' } });
    assert.deepEqual(await call('/v1/passenger/requests/active', 0), { status: 200, body: null });
    assert.ok(logs.some(e => (e as { event?: string }).event === 'offer_commit'));
    assert.ok(logs.some(e => (e as { event?: string }).event === 'driver_state_offer'));
    for (const token of tokens) assert.equal(JSON.stringify(logs).includes(token!), false);
    const insecure = createApiClient(base, async () => tokens[0]!, { development: true });
    await assert.rejects(insecure.request({ path: '/v1/matching/session', method: 'GET', decode: v => v }), /Credentials require HTTPS/);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true });
  }
});
