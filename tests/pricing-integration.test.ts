import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createGateway } from '../gateway/server.ts';
import { gatewayConfig } from '../gateway/config.ts';
import type { TomTomAdapter } from '../gateway/tomtom.ts';
import { createGeospatialClient } from '../src/services/geospatial/client.ts';
import { createApiClient } from '../src/services/api/client.ts';
import { createPassengerLiveGateway } from '../src/services/geospatial/passengerGateway.ts';
import { canRequest, quoteGates } from '../src/features/passenger/model.ts';
import { syntheticDraft, syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';

test('HTTP quotes compose stops/routing/pricing once, return 409 on conflict and never enable live matching', async () => {
  const requests: unknown[] = [];
  const adapter = { route: async (request: unknown) => { requests.push(request); return syntheticRoute; } } as unknown as TomTomAdapter;
  const server = createGateway(gatewayConfig({}), adapter, { pricing: { status: 'ready', config: syntheticPricing() } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const api = createApiClient(url, async () => null, { development: true });
    const client = createGeospatialClient(api, 1000); const gateway = createPassengerLiveGateway(client, async () => null);
    const draft = { ...syntheticDraft, stops: [{ ...syntheticDraft.origin, id: 'stop', coordinate: [0.4, 0.4] as const }] };
    const [a, b] = await Promise.all([gateway.quote(draft, undefined, 'integration-operation-1'), gateway.quote(draft, undefined, 'integration-operation-1')]);
    assert.equal(a.id, b.id); assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], { origin: draft.origin.coordinate, destination: draft.destination.coordinate, stops: [[0.4, 0.4]] });
    assert.equal(a.pricing?.status, 'priced'); assert.equal(a.price, undefined); assert.equal(a.paymentMethod, undefined);
    assert.deepEqual(quoteGates(a, gateway), { pricingReady: true, paymentReady: false, tripRequestAvailable: false });
    assert.equal(canRequest(a, 'online', false, gateway), false); await assert.rejects(gateway.request(a, 'request-1'));
    const conflict = await fetch(url + '/v1/passenger/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, operationId: 'integration-operation-1', stops: [] }) });
    assert.equal(conflict.status, 409); assert.equal((await conflict.json()).error.code, 'idempotency_conflict');
    for (const field of ['price', 'distance', 'duration', 'profile']) {
      const bad = await fetch(url + '/v1/passenger/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, operationId: 'integration-operation-2', [field]: 1 }) });
      assert.equal(bad.status, 400);
    }
    await gateway.quote({ ...draft, destination: { ...draft.destination, coordinate: [0.7, 0.7] } }, undefined, 'integration-operation-2');
    assert.equal(requests.length, 2);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('quote decoder rejects invalid money and live request sends only draft plus operationId', async () => {
  let body: unknown;
  const client = createGeospatialClient({ request: async request => {
    body = request.body; return request.decode({ status: 'unpriced', reason: 'pricing_not_configured', routePreview: {
      ...syntheticDraft, id: 'preview', createdAt: 1, expiresAt: 300001, route: syntheticRoute,
    } });
  } }, 1000);
  await client.quote({ ...syntheticDraft, operationId: 'operation-mobile-test' });
  assert.deepEqual(Object.keys(body as object).sort(), ['destination', 'operationId', 'origin', 'stops']);
});
