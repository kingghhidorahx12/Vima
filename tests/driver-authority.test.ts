import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createProductAuth } from '../gateway/productAuth.ts';
import { MatchingCoordinator } from '../gateway/matching/coordinator.ts';
import { createDriverAdminServer } from '../gateway/driverAdmin.ts';
import { createGateway } from '../gateway/server.ts';
import { gatewayConfig } from '../gateway/config.ts';
import { createAuthConfig } from '../gateway/matching/auth.ts';
import type { TomTomAdapter } from '../gateway/tomtom.ts';
import { decodeMatchingTrip, decodeDriver } from '../src/services/matching/decode.ts';
import { priceTrip } from '../gateway/pricing/engine.ts';
import { syntheticDraft, syntheticRoute, syntheticPricing } from './support/pricing-fixture.ts';
import type { DriverAdminCommand } from '../gateway/driverAuthority.ts';
import type { LifecycleCommand } from '../src/services/matching/lifecycle.ts';

const secret = 'd1-synthetic-auth-secret-for-tests-only';
const vehicle = { name: 'Synthetic sedan', plate: 'TEST-ONLY', color: 'White' };
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise<void>(r => setImmediate(r)); };
async function fixture(eta = async () => syntheticRoute) {
  const directory = await mkdtemp(join(tmpdir(), 'vima-d1-')); let now = 1_800_000_000_000;
  const makeAuth = () => createProductAuth({ runtimeDir: directory, secret, now: () => now,
    provider: { start: async () => 'VE' + 'a'.repeat(32), verify: async () => true } });
  let auth = makeAuth(); await auth.ready;
  async function register(phone: string) {
    const c = await auth.start({ phone }, 'test-ip'); const v = await auth.verify({ challengeId: c.challengeId, code: '123456' });
    if (v.status !== 'registration_required') throw Error('Expected new account');
    return (await auth.register({ registrationToken: v.registrationToken, name: 'Synthetic account' })).session;
  }
  const passenger = await register('7121234567'), driver = await register('7221234567');
  const p = { accountId: passenger.accountId, role: 'passenger' as const }, d = { accountId: driver.accountId, role: 'driver' as const };
  const quote = { ...syntheticDraft, id: 'quote', createdAt: now, expiresAt: now + 300_000, route: syntheticRoute,
    ...priceTrip({ config: syntheticPricing(), profile: 'URBANO', routeMetrics: syntheticRoute }),
    configVersion: syntheticPricing().version, profile: 'URBANO' as const, distanceMeters: syntheticRoute.distanceMeters };
  const make = () => new MatchingCoordinator({ auth: auth.authConfig, directory, pricingConfig: syntheticPricing(), eta,
    trace: () => {}, clock: { now: () => now, schedule: () => () => {} }, quote: (id, owner) => id === quote.id && owner === p.accountId ? quote : undefined });
  let c = make(); await c.start(); let serial = 0;
  return { directory, p, d, passenger, driver, quote, get auth() { return auth; }, get c() { return c; },
    admin(action: DriverAdminCommand['action'], operationId = `admin-${++serial}`) {
      return c.administer(() => auth.administer({ operationId, accountId: d.accountId, action, reason: 'Synthetic test approval', ...(action === 'approve' ? { vehicle } : {}) }));
    },
    async available() { await c.availability(d, 'AVAILABLE', `availability-${++serial}`); await c.location(d, [0.2, 0.2], undefined, `location-${++serial}`); },
    async offer() { const trip = await c.create(p, 'quote', 'request'); await flush(); return { trip, offer: (await c.driver(d)).offer! }; },
    async restart() { c.close(); auth = makeAuth(); await auth.ready; c = make(); await c.start(); },
    async close() { c.close(); await rm(directory, { recursive: true, force: true }); }, advance(ms: number) { now += ms; },
  };
}

test('D1 migrates v1 with exact backup, preserves tokens, and rollback retains current refresh/revocation state', async () => {
  const f = await fixture();
  try {
    const file = join(f.directory, 'auth-v1.json'); const v1 = JSON.parse(await readFile(file, 'utf8')); delete v1.admin; v1.version = 1;
    await writeFile(file, JSON.stringify(v1)); await f.restart();
    const names = (await readdir(f.directory)).filter(n => n.startsWith('auth-v1.before-v2.')); assert.equal(names.length, 1);
    assert.deepEqual(JSON.parse(await readFile(join(f.directory, names[0]!), 'utf8')), v1);
    assert.equal(f.auth.authConfig.authenticate(`Bearer ${f.driver.accessToken}`).accountId, f.d.accountId);
    const refreshed = await f.auth.refresh({ refreshToken: f.driver.refreshToken });
    await f.auth.logout(`Bearer ${f.passenger.accessToken}`);
    const current = JSON.parse(await readFile(file, 'utf8'));
    await f.c.administer(() => f.auth.rollbackPassengerSchema()); assert.equal(f.c.ready, false);
    const rolled = JSON.parse(await readFile(file, 'utf8')); assert.equal(rolled.version, 1);
    assert.deepEqual(rolled.users, current.users); assert.deepEqual(rolled.sessions, current.sessions);
    await f.restart();
    assert.throws(() => f.auth.authConfig.authenticate(`Bearer ${f.passenger.accessToken}`), /unauthorized/);
    assert.equal(f.auth.authConfig.authenticate(`Bearer ${refreshed.session.accessToken}`).accountId, f.d.accountId);
    await assert.rejects(f.auth.refresh({ refreshToken: f.driver.refreshToken }), /unauthorized/);
  } finally { await f.close(); }
});

test('D1 new account is Passenger; approval is idempotent, immutable, nullable-rated and current for old sessions', async () => {
  const f = await fixture();
  try {
    assert.throws(() => f.auth.authConfig.authenticate(`Bearer ${f.driver.accessToken}`, 'driver'), /driver_not_authorized/);
    await assert.rejects(f.c.availability(f.d, 'AVAILABLE', 'not-driver'), /forbidden/);
    const approved = await f.admin('approve', 'approval'); assert.deepEqual(await f.admin('approve', 'approval'), approved);
    await assert.rejects(f.c.administer(() => f.auth.administer({ operationId: 'approval', accountId: f.d.accountId, action: 'revoke', reason: 'Different' })), /idempotency_conflict/);
    assert.deepEqual((await f.auth.me(`Bearer ${f.driver.accessToken}`)).capabilities, ['passenger', 'driver']);
    const profile = decodeDriver(await f.c.driver(f.d)).profile; assert.equal(profile.driver.rating, null); assert.equal(profile.driver.ratingCount, 0);
    await assert.rejects(f.c.administer(() => f.auth.administer({ operationId: 'edit', action: 'approve', accountId: f.d.accountId, vehicle: { ...vehicle, plate: 'OTHER' }, reason: 'Different vehicle' })), /immutable/);
    await f.admin('revoke'); await f.restart();
    assert.deepEqual((await f.auth.me(`Bearer ${f.driver.accessToken}`)).capabilities, ['passenger']);
    await assert.rejects(f.c.driver(f.d), /driver_not_authorized/);
    await assert.rejects(f.c.availability(f.d, 'AVAILABLE', 'revoked'), /driver_not_authorized/);
    assert.deepEqual(f.auth.authConfig.profile(f.d.accountId), profile);
    await assert.rejects(f.auth.rollbackPassengerSchema(), /driver_history_present/);
  } finally { await f.close(); }
});

test('D1 suspension withdraws offers and prevents accepting an old pending offer, including after restart', async () => {
  const f = await fixture();
  try {
    await f.admin('approve'); await f.available(); const { trip, offer } = await f.offer(); assert.ok(offer);
    const revision = (await f.c.driver(f.d)).revision;
    const pendingPoll = assert.rejects(f.c.wait(f.d, undefined, revision), /driver_not_authorized/);
    await f.admin('suspend');
    await pendingPoll;
    await assert.rejects(f.c.offerAction(f.d, offer.id, 'accept', 'late'), /driver_not_authorized/);
    const store = JSON.parse(await readFile(join(f.directory, 'matching-v1.json'), 'utf8'));
    assert.equal(store.offers[offer.id].state, 'REVOKED'); assert.equal(store.drivers[f.d.accountId].availability, 'PAUSED');
    await f.restart(); assert.equal((await f.c.fetch(f.p, trip.id)).requestState, 'SEARCHING');
    await assert.rejects(f.c.driver(f.d), /driver_not_authorized/);
  } finally { await f.close(); }
});

test('D1 approval joins an existing search, requires a complete vehicle and cannot match the account to itself', async () => {
  const f = await fixture();
  try {
    const approve = (accountId: string, value: unknown, operationId: string) => f.c.administer(() => f.auth.administer({
      operationId, accountId, action: 'approve', reason: 'Synthetic approval', vehicle: value }));
    await assert.rejects(approve(f.d.accountId, { name: 'Missing plate/color' }, 'incomplete'), /invalid_driver_admin_input/);
    const trip = await f.c.create(f.p, 'quote', 'request');
    await approve(f.p.accountId, vehicle, 'same-person');
    const dual = { ...f.p, role: 'driver' as const };
    await f.c.availability(dual, 'AVAILABLE', 'own-availability'); await f.c.location(dual, [0.2, 0.2], 0, 'own-location'); await flush();
    assert.equal((await f.c.driver(dual)).offer, undefined);
    await f.admin('approve'); await f.available(); await flush();
    assert.equal((await f.c.driver(f.d)).offer?.requestId, trip.id);
    assert.equal((await f.c.fetch(f.p, trip.id)).requestState, 'SEARCHING');
  } finally { await f.close(); }
});

for (const acceptFirst of [true, false]) test(`D1 serializes accept versus revocation, accept first=${acceptFirst}`, async () => {
  const f = await fixture();
  try {
    await f.admin('approve'); await f.available(); const { trip, offer } = await f.offer();
    const accept = () => f.c.offerAction(f.d, offer.id, 'accept', 'accept');
    const revoke = () => f.admin('revoke');
    const results = await Promise.allSettled(acceptFirst ? [accept(), revoke()] : [revoke(), accept()]);
    assert.equal(results[0]!.status, 'fulfilled'); assert.equal(results[1]!.status, acceptFirst ? 'fulfilled' : 'rejected');
    await f.restart(); const snapshot = await f.c.fetch(f.p, trip.id);
    assert.equal(snapshot.requestState, acceptFirst ? 'ASSIGNED' : 'SEARCHING');
    if (!acceptFirst) return;
    const a = snapshot.assignment!; decodeMatchingTrip(snapshot);
    assert.equal(a.driver.rating, null); assert.equal(a.driver.ratingCount, 0);
    decodeMatchingTrip({ ...snapshot, assignment: { ...a, driver: { name: a.driver.name, rating: 4.9 } } });
    decodeMatchingTrip({ ...snapshot, assignment: { ...a, driver: { name: a.driver.name } } });
    const command = (name: LifecycleCommand, id: string) => f.c.lifecycleCommand(f.d, trip.id, a.id, id, name);
    await assert.rejects(f.c.cancelAssignment(f.d, trip.id, 'cancel', a.id), /driver_not_authorized/);
    await f.c.location(f.d, [0.2, 0.2], 0, 'pickup');
    await command({ name: 'arrive' }, 'arrive');
    await assert.rejects(command({ name: 'start', pin: a.pin === '1111' ? '2222' : '1111' }, 'bad-pin'), /incorrect_pin/);
    await command({ name: 'start', pin: a.pin }, 'start');
    await f.c.telemetry(f.d, trip.id, a.id, { sequence: 1, coordinate: [0.2, 0.2], capturedAt: 1_800_000_000_000 });
    const paid = await command({ name: 'finish', kind: 'normal', finalTelemetrySequence: 1 }, 'finish');
    assert.deepEqual(paid.assignment!.lifecycle.settlement!.price, f.quote.price);
    const receipt = await command({ name: 'cash_received' }, 'cash');
    assert.equal((await f.c.fetch(f.p, trip.id)).requestState, 'COMPLETED');
    await assert.rejects(f.c.driver(f.d), /driver_not_authorized/);
    await f.restart(); assert.deepEqual(await command({ name: 'cash_received' }, 'cash'), receipt);
    assert.equal((await f.c.fetch(f.p, trip.id)).assignment!.driver.rating, null);
    await assert.rejects(f.c.availability(f.d, 'AVAILABLE', 'after-trip'), /driver_not_authorized/);
  } finally { await f.close(); }
});

test('D1 rejects an ETA computed before suspension; approval does not clear a security block', async () => {
  let release!: () => void; const barrier = new Promise<void>(r => { release = r; });
  const f = await fixture(async () => { await barrier; return syntheticRoute; });
  try {
    await f.admin('approve'); await f.available(); const trip = await f.c.create(f.p, 'quote', 'request'); await flush();
    await f.admin('suspend'); release(); await flush();
    const state = JSON.parse(await readFile(join(f.directory, 'matching-v1.json'), 'utf8'));
    assert.equal(Object.values(state.offers).length, 0);
    assert.equal((await f.c.fetch(f.p, trip.id)).requestState, 'SEARCHING');
    await f.admin('security_block'); await f.admin('approve');
    await assert.rejects(f.c.driver(f.d), /driver_not_authorized/); // Approval cannot clear a security block.
  } finally { release(); await flush(); await f.close(); }
});

test('D1 restart reconciles an auth commit interrupted before matching withdrew its offer', async () => {
  const f = await fixture();
  try {
    await f.admin('approve'); await f.available(); const { trip, offer } = await f.offer();
    f.c.close(); // Simulate process exit after auth rename, before coordinator reconciliation.
    await f.auth.administer({ operationId: 'crash-boundary', accountId: f.d.accountId, action: 'suspend', reason: 'Synthetic crash boundary' });
    const before = JSON.parse(await readFile(join(f.directory, 'matching-v1.json'), 'utf8'));
    assert.equal(before.offers[offer.id].state, 'ACTIVE');
    await f.restart();
    const after = JSON.parse(await readFile(join(f.directory, 'matching-v1.json'), 'utf8'));
    assert.equal(after.offers[offer.id].state, 'REVOKED');
    assert.equal((await f.c.fetch(f.p, trip.id)).requestState, 'SEARCHING');
    await assert.rejects(f.c.offerAction(f.d, offer.id, 'accept', 'after-crash'), /driver_not_authorized/);
  } finally { await f.close(); }
});

test('D1 suspension permits only the existing trip; independent security block denies its continuation immediately', async () => {
  const f = await fixture();
  try {
    await f.admin('approve'); await f.available(); const { trip, offer } = await f.offer();
    await f.c.offerAction(f.d, offer.id, 'accept', 'accept'); await f.admin('suspend');
    assert.equal((await f.c.driver(f.d)).assignment?.state, 'ASSIGNED');
    const a = (await f.c.fetch(f.p, trip.id)).assignment!;
    await f.c.lifecycleCommand(f.d, trip.id, a.id, 'arrive', { name: 'arrive' });
    await f.admin('security_block');
    await assert.rejects(f.c.driver(f.d), /driver_not_authorized/);
    await assert.rejects(f.c.location(f.d, [0.2, 0.2], 0, 'blocked-location'), /driver_not_authorized/);
    await assert.rejects(f.c.lifecycleCommand(f.d, trip.id, a.id, 'start', { name: 'start', pin: a.pin }), /driver_not_authorized/);
    assert.equal((await f.c.fetch(f.p, trip.id)).requestState, 'ARRIVED_PICKUP');
    await f.admin('security_unblock'); await f.restart();
    assert.deepEqual((await f.auth.me(`Bearer ${f.driver.accessToken}`)).capabilities, ['passenger']);
    await f.c.lifecycleCommand(f.d, trip.id, a.id, 'start', { name: 'start', pin: a.pin });
    assert.equal((await f.c.fetch(f.p, trip.id)).requestState, 'IN_PROGRESS');
    await assert.rejects(f.c.availability(f.d, 'AVAILABLE', 'new-work'), /driver_not_authorized/);
  } finally { await f.close(); }
});

test('D1 corrupt permissions/audit, duplicate sessions and invalid versions fail closed without replacing the file', async () => {
  const f = await fixture();
  try {
    await f.admin('approve'); await f.admin('revoke'); f.c.close();
    const file = join(f.directory, 'auth-v1.json'); const original = JSON.parse(await readFile(file, 'utf8'));
    const changes = [
      (v: typeof original) => { v.users[1].driver.status = 'approved'; },
      (v: typeof original) => { v.admin = []; },
      (v: typeof original) => { v.sessions[1].accessHash = v.sessions[0].accessHash; },
      (v: typeof original) => { v.users[1].driver.profile.driver.rating = 5; },
      (v: typeof original) => { v.admin[0].fingerprint = '0'.repeat(64); },
      (v: typeof original) => { v.version = 99; },
    ];
    for (const change of changes) {
      const raw = structuredClone(original); change(raw); const bytes = JSON.stringify(raw); await writeFile(file, bytes);
      const broken = createProductAuth({ runtimeDir: f.directory, secret, provider: { start: async () => '', verify: async () => false } });
      await assert.rejects(broken.ready, /invalid_product_auth_store/);
      assert.equal(broken.authConfig.isReady!(), false);
      assert.throws(() => broken.authConfig.authenticate(`Bearer ${f.driver.accessToken}`, 'driver'), /authority_unavailable/);
      assert.equal(await readFile(file, 'utf8'), bytes);
    }
  } finally { await f.close(); }
});

test('D1 failed durable authorization write publishes no permission and poisons readiness', async () => {
  const f = await fixture();
  try {
    const file = join(f.directory, 'auth-v1.json'); await rm(file); await mkdir(file); // Rename cannot replace a directory.
    await assert.rejects(f.admin('approve'), /storage_unavailable/);
    assert.equal(f.auth.authConfig.eligibleDriver!(f.d.accountId), false);
    assert.equal(f.c.ready, false);
    assert.throws(() => f.auth.authConfig.authenticate(`Bearer ${f.driver.accessToken}`), /authority_unavailable/);
    await assert.rejects(f.c.fetch(f.p, 'request'), /matching_unavailable/);
  } finally { await f.close(); }
});

test('D1 active Gateway enforces explicit context and current capacity with the original OTP session, never QA fallback', async () => {
  const f = await fixture(); f.c.close();
  const qaToken = 'd1-synthetic-qa-token-not-product-session';
  const server = createGateway({ ...gatewayConfig({}), runtimeDir: f.directory, rateLimit: 500 },
    { route: async () => syntheticRoute } as unknown as TomTomAdapter,
    { configured: true, productAuth: f.auth, auth: createAuthConfig({ accounts: [{ accountId: 'qa-only', role: 'passenger', token: qaToken }] }),
      pricing: { status: 'ready', config: syntheticPricing() }, matchingTrace: () => {} });
  const admin = createDriverAdminServer(secret, server);
  server.listen(0, '127.0.0.1'); admin.listen(0, '127.0.0.1'); await Promise.all([once(server, 'listening'), once(admin, 'listening')]);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const privateBase = `http://127.0.0.1:${(admin.address() as AddressInfo).port}`;
  const call = (path: string, context?: string, bearer = f.driver.accessToken) => fetch(base + path,
    { headers: { Authorization: `Bearer ${bearer}`, ...(context ? { 'X-Vima-Operational-Context': context } : {}) } });
  const administer = async (action: string) => fetch(privateBase + '/driver-authority', { method: 'POST', headers: { Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ operationId: `http-${action}`, action, accountId: f.d.accountId, reason: 'Synthetic', ...(action === 'approve' ? { vehicle } : {}) }) });
  try {
    assert.equal((await call('/ready')).status, 200);
    assert.equal((await call('/v1/driver/state', 'driver')).status, 403);
    assert.equal((await call('/v1/matching/session', 'driver', qaToken)).status, 401);
    assert.equal((await administer('approve')).status, 200);
    assert.equal((await call('/v1/driver/state')).status, 403);
    assert.equal((await call('/v1/driver/state', 'driver')).status, 200);
    assert.equal((await call('/v1/passenger/requests/active', 'driver')).status, 403);
    assert.equal((await fetch(base + '/v1/passenger/quotes', { method: 'POST', headers: {
      Authorization: `Bearer ${f.driver.accessToken}`, 'X-Vima-Operational-Context': 'driver' }, body: '{}' })).status, 403);
    assert.equal((await call('/v1/passenger/requests/active', 'passenger')).status, 200);
    assert.equal((await call('/v1/driver/state', 'admin')).status, 400);
    assert.equal((await call('/v1/matching/session', 'driver')).status, 200);
    assert.equal((await administer('revoke')).status, 200);
    assert.equal((await call('/v1/driver/state', 'driver')).status, 403);
    assert.equal((await call('/v1/matching/session', 'driver')).status, 403);
    assert.deepEqual((await (await call('/v1/auth/me')).json()).capabilities, ['passenger']);
    assert.equal((await fetch(base + '/driver-authority', { method: 'POST', body: '{}' })).status, 400);
    assert.deepEqual((await (await call('/v1/auth/me')).json()).capabilities, ['passenger']);
  } finally {
    admin.closeAllConnections(); server.closeAllConnections();
    await Promise.all([new Promise<void>(r => admin.close(() => r())), new Promise<void>(r => server.close(() => r()))]); await f.close();
  }
});

test('D1 private admin authenticates loopback requests, executes in active Gateway, and rejects malformed commands', async () => {
  const f = await fixture(); const admin = createDriverAdminServer(secret, { administerDriver: value => f.c.administer(() => f.auth.administer(value)), rollbackPassengerAuth: () => f.auth.rollbackPassengerSchema() });
  admin.listen(0, '127.0.0.1'); await once(admin, 'listening'); const url = `http://127.0.0.1:${(admin.address() as AddressInfo).port}/driver-authority`;
  const body = JSON.stringify({ operationId: 'http-approve', action: 'approve', accountId: f.d.accountId, vehicle, reason: 'Synthetic' });
  try {
    assert.equal((await fetch(url, { method: 'POST', body })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body })).status, 200);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: '{}' })).status, 400);
    assert.equal((await fetch(url.replace('/driver-authority', '/v1/auth/register'), { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body })).status, 404);
  } finally { admin.closeAllConnections(); await new Promise<void>(r => admin.close(() => r())); await f.close(); }
});
