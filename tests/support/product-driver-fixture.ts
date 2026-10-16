import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { createProductAuth } from '../../gateway/productAuth.ts';
import { createGateway } from '../../gateway/server.ts';
import { createDriverAdminServer } from '../../gateway/driverAdmin.ts';
import { gatewayConfig } from '../../gateway/config.ts';
import type { TomTomAdapter } from '../../gateway/tomtom.ts';
import { createProductAuthClient } from '../../src/services/auth/productSession.ts';
import { createMatchingClient } from '../../src/services/matching/client.ts';
import { decodeQuoteResponse } from '../../src/services/pricing/normalize.ts';
import type { DriverAdminCommand } from '../../gateway/driverAuthority.ts';
import { syntheticPricing, syntheticRoute, syntheticDraft } from './pricing-fixture.ts';
import type { RideDraft } from '../../src/features/passenger/model.ts';
import type { RouteRequest } from '../../src/services/geospatial/contracts.ts';

/** Real product HTTP + private admin; only Twilio and route-provider I/O are simulated. */
export async function productDriverFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'vima-d3-'));
  const secret = 'D3-synthetic-server-secret-not-a-real-credential';
  let now = 1_800_000_000_000; let base = ''; let adminBase = ''; let sequence = 0;
  let failPath = ''; let offline = false;
  const routeCalls: RouteRequest[] = [];
  function servers() {
    const authority = createProductAuth({ runtimeDir: directory, secret, now: () => now,
      provider: { start: async () => 'VE' + 'a'.repeat(32), verify: async () => true } });
    const gateway = createGateway({ ...gatewayConfig({}), runtimeDir: directory, rateLimit: 10_000 },
      { route: async (input: RouteRequest) => {
        routeCalls.push(input);
        const coordinates = [input.origin, ...input.stops, input.destination].map(p => [...p]);
        return { ...syntheticRoute, geometry: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
          bounds: { southwest: [Math.min(...coordinates.map(p => p[0]!)), Math.min(...coordinates.map(p => p[1]!))],
            northeast: [Math.max(...coordinates.map(p => p[0]!)), Math.max(...coordinates.map(p => p[1]!))] } };
      } } as unknown as TomTomAdapter,
      { productAuth: authority, configured: true, logger: () => {}, matchingTrace: () => {},
        now: () => now, matchingClock: { now: () => now, schedule: () => () => {} },
        pricing: { status: 'ready', config: syntheticPricing() } });
    return { gateway, admin: createDriverAdminServer(secret, gateway) };
  }
  let running = servers();
  async function start() {
    running.gateway.listen(0, '127.0.0.1'); running.admin.listen(0, '127.0.0.1');
    await Promise.all([once(running.gateway, 'listening'), once(running.admin, 'listening')]);
    base = `http://127.0.0.1:${(running.gateway.address() as AddressInfo).port}`;
    adminBase = `http://127.0.0.1:${(running.admin.address() as AddressInfo).port}`;
    // /ready correctly remains 503 during async durable recovery.
    for (let i = 0; i < 100; i++) if ((await fetch(base + '/ready')).status === 200) return;
    assert.fail('Gateway failed durable recovery');
  }
  async function stop() {
    running.gateway.closeAllConnections(); running.admin.closeAllConnections();
    await Promise.all([new Promise<void>(r => running.gateway.close(() => r())), new Promise<void>(r => running.admin.close(() => r()))]);
  }
  await start();
  const fetcher: typeof fetch = async (url, init) => {
    if (offline) throw new TypeError('synthetic_offline');
    const u = new URL(String(url)); const response = await fetch(base + u.pathname + u.search, init);
    if (failPath === u.pathname && init?.method === 'POST') { failPath = ''; throw new TypeError('synthetic_lost_receipt'); }
    return response;
  };
  function device() {
    let value: string | null = null;
    const storage = { read: async () => value, write: async (v: string) => { value = v; }, clear: async () => { value = null; } };
    const make = () => createProductAuthClient('https://gateway.test', storage, fetcher, () => now);
    let auth = make();
    return { get auth() { return auth; }, reopen() { auth = make(); return auth; },
      matching(context: 'passenger' | 'driver') { return createMatchingClient(auth.api, { context, trace: () => {} }); },
      async register(phone: string) {
        const challenge = await auth.startOtp(phone); const verified = await auth.verifyOtp(challenge.challengeId, '123456');
        assert.equal(verified.status, 'registration_required'); if (verified.status !== 'registration_required') throw Error('expected registration');
        return auth.register(verified.registrationToken, 'Synthetic product account');
      } };
  }
  const passenger = device(), driver = device();
  const p = await passenger.register('7121234567'), d = await driver.register('7221234567');
  const vehicle = { name: 'Synthetic sedan', plate: 'TEST-ONLY', color: 'White' };
  return { directory, passenger, driver, p, d, routeCalls, get base() { return base; }, get now() { return now; },
    advance(ms: number) { now += ms; }, offline(value: boolean) { offline = value; }, loseReceipt(path: string) { failPath = path; },
    async admin(action: DriverAdminCommand['action'], operationId = `admin-${++sequence}`) {
      const input = { accountId: d.accountId, action, operationId, reason: 'Synthetic D3 test', ...(action === 'approve' ? { vehicle } : {}) };
      const response = await fetch(adminBase + '/driver-authority', { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(input) });
      assert.equal(response.status, 200); return response.json();
    },
    async cliApprove() {
      const child = spawn(process.execPath, ['scripts/driver-admin.cjs'], { env: { ...process.env,
        VIMA_DRIVER_ADMIN_SECRET: secret, VIMA_DRIVER_ADMIN_PORT: new URL(adminBase).port }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', error = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { error += b; });
      child.stdin.end(JSON.stringify({ accountId: d.accountId, action: 'approve', operationId: 'cli-approve', reason: 'Synthetic D3 test', vehicle }));
      assert.equal((await once(child, 'close'))[0], 0, error); assert.equal(JSON.parse(output).status, 'approved');
    },
    async request(draft: RideDraft = syntheticDraft) {
      const quote = await passenger.auth.api.request({ path: '/v1/passenger/quotes', method: 'POST',
        operationalContext: 'passenger', body: { ...draft, operationId: `d3-product-quote-${++sequence}` }, decode: decodeQuoteResponse });
      if (quote.status !== 'priced') throw Error('quote not priced');
      return passenger.matching('passenger').request(quote.quote.id, `request-${++sequence}`);
    },
    async offer() {
      const client = driver.matching('driver'); await client.availability('AVAILABLE', `available-${++sequence}`);
      await client.location(syntheticDraft.origin.coordinate, 90, `gps-${++sequence}`);
      for (let i = 0; i < 100; i++) { const state = await client.driver(); if (state.offer) return state.offer; }
      throw Error('offer did not arrive');
    },
    async restart() { await stop(); running = servers(); await start(); },
    async close() { await stop(); await rm(directory, { recursive: true, force: true }); },
  };
}
