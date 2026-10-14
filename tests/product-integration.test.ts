import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import React from 'react';
import { createProductAuthClient, ProductAuthClientError } from '../src/services/auth/productSession.ts';
import { ApiError } from '../src/services/api/client.ts';
import { createMatchingClient } from '../src/services/matching/client.ts';
import { createGateway } from '../gateway/server.ts';
import { createProductAuth } from '../gateway/productAuth.ts';
import { gatewayConfig } from '../gateway/config.ts';
import type { TomTomAdapter } from '../gateway/tomtom.ts';
import { syntheticDraft, syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';
import { appVariant } from '../config/appVariant.cjs';

const require = createRequire(import.meta.url);
const { createMapHarness } = require('./support/map-renderer.cjs');
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
const accountId = '00000000-0000-4000-8000-000000000001';
const account = { accountId, displayName: 'Test', capabilities: ['passenger'] as const };
const grant = { ...account, accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43), accessExpiresIn: 900 };
const persisted = () => JSON.stringify({ ...grant, accessExpiresAt: Date.now() + 900000 });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function store(initial: string | null = persisted()) {
  let value = initial; let writes = 0;
  return { read: async () => value, write: async (next: string) => { writes++; value = next; }, clear: async () => { value = null; },
    value: () => value, writes: () => writes };
}

test('product transport completes a real Gateway 25-second idle long-poll and restores the same active request', { timeout: 45000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-product-poll-'));
  const productAuth = createProductAuth({ runtimeDir: directory, secret: 'test-only-secret-at-least-thirty-two-bytes',
    provider: { start: async () => `VE${'a'.repeat(32)}`, verify: async () => true } });
  const server = createGateway({ ...gatewayConfig({}), runtimeDir: directory, rateLimit: 1000 },
    { route: async () => syntheticRoute } as unknown as TomTomAdapter,
    { configured: true, productAuth, matchingTrace: () => {}, pricing: { status: 'ready', config: syntheticPricing() } });
  const storage = store(null);
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Test-only HTTPS transport seam to loopback, never a real OTP/provider request.
    const fetcher: typeof fetch = (url, init) => fetch(local + new URL(String(url)).pathname + new URL(String(url)).search, init);
    const auth = createProductAuthClient('https://gateway.test', storage, fetcher);
    const challenge = await auth.startOtp('+527121234567');
    const verified = await auth.verifyOtp(challenge.challengeId, '123456');
    assert.equal(verified.status, 'registration_required');
    if (verified.status !== 'registration_required') assert.fail();
    await auth.register(verified.registrationToken, 'Test Passenger');
    const quote = await auth.api.request({ path: '/v1/passenger/quotes', method: 'POST',
      body: { ...syntheticDraft, operationId: 'product-integration-quote' }, decode: raw => raw as { status: string; quote: { id: string } } });
    assert.equal(quote.status, 'priced');
    const matching = createMatchingClient(auth.api, { trace: () => {} });
    const trip = await matching.request(quote.quote.id, 'product-integration-request');
    const started = Date.now();
    const poll = await auth.api.request({ path: `/v1/passenger/requests/${trip.id}/changes?afterRevision=${trip.revision}`,
      method: 'GET', timeoutMs: 30000, decode: raw => raw as { revision: number } });
    assert.equal(poll.revision, trip.revision);
    assert.ok(Date.now() - started >= 24000, 'Gateway completed its actual idle hold, not an early simulated receipt');
    const reopened = createProductAuthClient('https://gateway.test', storage, fetcher);
    assert.equal((await reopened.current())?.accountId, (await auth.current())?.accountId);
    const restored = await createMatchingClient(reopened.api, { trace: () => {} }).activeRequest();
    assert.equal(restored?.id, trip.id);
    await auth.logout(); assert.equal(storage.value(), null);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
  }
});

test('matching propagates its 30-second budget and cancellation through product transport', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let started = 0; let aborted = 0; let errors = 0;
  const auth = createProductAuthClient('https://gateway.test', store(), async (_url, init) => {
    started++;
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json({ revision: 1 })), 25000);
      init!.signal!.addEventListener('abort', () => { aborted++; clearTimeout(timer); reject(new DOMException('cancelled', 'AbortError')); }, { once: true });
    });
  });
  const matching = createMatchingClient(auth.api, { trace: event => { if (event === 'poll_error') errors++; } });
  let invalidations = 0;
  const stop = matching.subscribeTrip('request', () => invalidations++, () => {});
  await settle(); t.mock.timers.tick(12001); await settle();
  assert.equal(aborted, 0); assert.equal(errors, 0);
  t.mock.timers.tick(13000); await settle();
  assert.equal(invalidations, 1); assert.equal(matching.getConnection(), 'online');
  assert.equal(started, 2); stop(); await settle(); assert.equal(aborted, 1);
});

test('three concurrent expired requests share one refresh; transient offline preserves credentials and reconnects', async () => {
  const storage = store(JSON.stringify({ ...grant, accessExpiresAt: Date.now() - 1 }));
  let refreshCalls = 0; let finish!: (response: Response) => void; let offline = false;
  const auth = createProductAuthClient('https://gateway.test', storage, async url => {
    if (new URL(String(url)).pathname === '/v1/auth/refresh') { refreshCalls++; return new Promise(resolve => { finish = resolve; }); }
    if (offline) throw new TypeError('offline');
    return Response.json({ accountId, role: 'passenger', matchingAvailable: true });
  });
  const matching = createMatchingClient(auth.api, { trace: () => {} });
  const requests = [matching.identity(), matching.identity(), matching.identity()];
  while (!finish) await settle(); assert.equal(refreshCalls, 1);
  finish(Response.json({ status: 'authenticated', session: grant })); await Promise.all(requests);
  assert.equal(storage.writes(), 1);
  offline = true; await assert.rejects(matching.identity()); assert.equal(matching.getConnection(), 'offline');
  assert.equal(auth.getSnapshot().status, 'authenticated'); assert.ok(storage.value());
  offline = false; await matching.identity(); assert.equal(matching.getConnection(), 'online');
});

test('a definitive 401 stops polling without offline retries and publishes invalidation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const storage = store(); let calls = 0; const reasons: string[] = [];
  const auth = createProductAuthClient('https://gateway.test', storage, async () => { calls++; return Response.json({ error: { code: 'unauthorized' } }, { status: 401 }); });
  auth.subscribe(() => { reasons.push(auth.getSnapshot().status); });
  const matching = createMatchingClient(auth.api, { trace: () => {} });
  const stop = matching.subscribeTrip('request', () => {}, () => {});
  await settle(); await settle();
  assert.equal(storage.value(), null); assert.ok(reasons.includes('signed-out'));
  assert.equal(matching.getConnection(), 'online');
  const before = calls; t.mock.timers.tick(60000); await settle(); assert.equal(calls, before); stop();
});

test('a second 401 after successful refresh fails closed rather than rotating indefinitely', async () => {
  const storage = store(); let refreshes = 0;
  const auth = createProductAuthClient('https://gateway.test', storage, async url => {
    if (new URL(String(url)).pathname === '/v1/auth/refresh') { refreshes++; return Response.json({ status: 'authenticated', session: grant }); }
    return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
  });
  await assert.rejects(auth.api.request({ path: '/probe', method: 'GET', decode: raw => raw }), error => error instanceof ApiError && error.status === 401);
  assert.equal(refreshes, 1); assert.equal(storage.value(), null); assert.equal(auth.getSnapshot().reason, 'expired');
});

test('logout fences concurrent account acceptance until its server and local cleanup finish', async () => {
  const storage = store(); let finish!: (response: Response) => void; let verifications = 0;
  const auth = createProductAuthClient('https://gateway.test', storage, async url => {
    const path = new URL(String(url)).pathname;
    if (path === '/v1/auth/logout') return new Promise(resolve => { finish = resolve; });
    if (path === '/v1/auth/otp/verify') { verifications++; return Response.json({ status: 'authenticated', session: grant }); }
    return Response.json(account);
  });
  await auth.current(); const logout = auth.logout();
  while (!finish) await settle(); assert.equal(auth.getSnapshot().status, 'closing');
  await assert.rejects(auth.verifyOtp('challenge', '123456'), /auth_cancelled/); assert.equal(verifications, 0);
  finish(Response.json({ status: 'logged_out' })); await logout; assert.equal(storage.value(), null);
  await auth.verifyOtp('challenge', '123456'); assert.equal(verifications, 1); assert.equal(auth.getSnapshot().status, 'authenticated');
});

test('a native write deadline releases UI but never releases the serialization fence or restores logged-out credentials', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let value: string | null = persisted(); let writes = 0; let finish!: () => void;
  const auth = createProductAuthClient('https://gateway.test', { read: async () => value,
    write: async next => { writes++; await new Promise<void>(resolve => { finish = resolve; }); value = next; }, clear: async () => { value = null; } },
    async url => new URL(String(url)).pathname === '/v1/auth/logout' ? Response.json({ status: 'logged_out' })
      : Response.json({ status: 'authenticated', session: grant }));
  const verifying = auth.verifyOtp('challenge', '123456');
  const rejected = assert.rejects(verifying, error => error instanceof ProductAuthClientError && error.code === 'session_storage_unavailable');
  while (!finish) await settle(); t.mock.timers.tick(8001); await rejected;
  assert.equal(auth.getSnapshot().status, 'storage-blocked');
  await assert.rejects(auth.verifyOtp('challenge', '123456'), /session_storage_unavailable/); assert.equal(writes, 1);
  const logout = auth.logout(); const logoutRejected = assert.rejects(logout, /session_storage_unavailable/);
  await settle(); t.mock.timers.tick(8001); await logoutRejected;
  finish(); await settle(); await settle();
  assert.equal(value, null); assert.equal(writes, 1); assert.equal(await auth.current(), null);
});

test('hung native deletion is bounded; no new account can overwrite its pending cleanup', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = persisted(); let value: string | null = original; let deleting!: () => void;
  const auth = createProductAuthClient('https://gateway.test', { read: async () => value, write: async next => { value = next; },
    clear: async () => { await new Promise<void>(resolve => { deleting = resolve; }); value = null; } }, async () => Response.json({ status: 'logged_out' }));
  const logout = auth.logout(); const rejected = assert.rejects(logout, /session_storage_unavailable/);
  while (!deleting) await settle(); t.mock.timers.tick(8001); await rejected;
  await assert.rejects(auth.current(), /session_storage_unavailable/); assert.equal(value, original);
  deleting(); await settle(); assert.equal(value, null); assert.equal(await auth.current(), null);
});

test('late successful API response from account A cannot survive identity replacement by B', async () => {
  const storage = store(); let finish!: (response: Response) => void;
  const next = { ...grant, accountId: '00000000-0000-4000-8000-000000000002' };
  const auth = createProductAuthClient('https://gateway.test', storage, async url => new URL(String(url)).pathname === '/v1/auth/otp/verify'
    ? Response.json({ status: 'authenticated', session: next }) : new Promise(resolve => { finish = resolve; }));
  const pending = auth.api.request({ path: '/probe', method: 'GET', decode: raw => raw }); const rejected = assert.rejects(pending, /auth_cancelled/);
  while (!finish) await settle(); await auth.verifyOtp('challenge', '123456'); finish(Response.json({ previousAccount: true }));
  await rejected; assert.equal((await auth.current())?.accountId, next.accountId);
});

test('product thumbnails use product headers only on their own Gateway, never a QA token, and disappear on logout', async () => {
  const before = { variant: process.env.EXPO_PUBLIC_VIMA_VARIANT, mode: process.env.EXPO_PUBLIC_VIMA_AUTH_MODE };
  process.env.EXPO_PUBLIC_VIMA_VARIANT = 'qa'; process.env.EXPO_PUBLIC_VIMA_AUTH_MODE = 'product';
  const auth = createProductAuthClient('https://gateway.test', store(), async () => Response.json(account));
  await auth.current(); let qaReads = 0;
  const h = createMapHarness({ fileOverrides: {
    'src/services/auth/productSession.ts': { productAuthClient: () => auth },
    'src/services/storage/credentials.ts': { credentials: { read: async () => { qaReads++; return 'q'.repeat(32); } } },
  }, externalOverrides: { 'expo-image': { Image: 'Image' } } });
  const uri = 'https://gateway.test/v1/media/place-images/test/thumbnail';
  const tree = await h.render(React.createElement(h.load('src/features/passenger/PlaceThumbnail.tsx').PlaceThumbnail,
    { place: { id: 'test', name: 'Test', image: {} }, resolveMedia: () => ({ uri, cacheKey: 'test-media' }) }));
  try {
    assert.equal(qaReads, 0);
    const image = tree.root.findByType('Image');
    assert.equal(image.props.source.headers.Authorization, 'Bearer ' + grant.accessToken);
    assert.equal(image.props.cachePolicy, 'none');
    await assert.rejects(auth.mediaHeaders('https://other.test/v1/media/place-images/test/thumbnail'), /product_media_origin_mismatch/);
    await assert.rejects(auth.mediaHeaders('https://gateway.test/v1/driver/state'), /product_media_origin_mismatch/);
    await h.act(async () => auth.logout()); assert.equal(tree.root.findAllByType('Image').length, 0);
    assert.equal(qaReads, 0);
  } finally {
    await h.act(async () => tree.unmount());
    if (before.variant === undefined) delete process.env.EXPO_PUBLIC_VIMA_VARIANT; else process.env.EXPO_PUBLIC_VIMA_VARIANT = before.variant;
    if (before.mode === undefined) delete process.env.EXPO_PUBLIC_VIMA_AUTH_MODE; else process.env.EXPO_PUBLIC_VIMA_AUTH_MODE = before.mode;
  }
});

test('protected Passenger unmounts on rejected refresh while mounted, clears queries and returns to OTP', async () => {
  let revoked = false; let matching!: ReturnType<typeof createMatchingClient>; let mounts = 0; let unmounts = 0;
  const storage = store();
  const auth = createProductAuthClient('https://gateway.test', storage, async url => revoked
    ? Response.json({ error: { code: 'unauthorized' } }, { status: 401 })
    : Response.json(new URL(String(url)).pathname === '/v1/auth/me' ? account : { accountId, role: 'passenger', matchingAvailable: true }));
  const routes: string[] = []; let clears = 0;
  const router = { replace: (route: string) => routes.push(route), push() {}, dismissAll() {} };
  function Passenger({ gateway }: { gateway: { matching: typeof matching } }) {
    matching = gateway.matching;
    React.useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
    return React.createElement('View', { testID: 'protected-passenger' });
  }
  const h = createMapHarness({ reduced: true, fileOverrides: {
    'src/services/auth/productSession.ts': { productAuthClient: () => auth, ProductAuthClientError },
    'src/services/api/client.ts': { ApiError }, 'src/services/matching/client.ts': { createMatchingClient },
    'src/features/passenger/PassengerScreen.tsx': { PassengerScreen: Passenger },
    'src/features/passenger/passengerMapConfig.ts': { passengerMapConfig: {} },
    'src/services/geospatial/client.ts': { createGeospatialClient: () => ({}) },
    'src/services/geospatial/config.ts': { geospatialClientConfig: { timeoutMs: 12000 } },
    'src/services/geospatial/passengerGateway.ts': { createPassengerLiveGateway: (...args: any[]) => ({ matching: args.at(-1).matching }) },
    'src/services/geospatial/mobilePersonalPlaces.ts': { mobilePersonalPlaces: {} },
    'src/services/geospatial/mobileInstallation.ts': { mobileInstallationId: () => {} },
    'src/services/location/currentPlace.ts': { locateCurrentPlace: () => {} },
    'src/features/auth/AccessSurface.tsx': { RestorationSurface: () => React.createElement('View') },
  }, externalOverrides: { 'expo-router': { useRouter: () => router }, '@tanstack/react-query': { useQueryClient: () => ({ clear: () => { clears++; } }) } } });
  const tree = await h.render(React.createElement(h.load('src/features/passenger/ProductPassengerScreen.tsx').default));
  try {
    assert.equal(mounts, 1); revoked = true;
    await h.act(async () => { await assert.rejects(matching.identity()); });
    assert.equal(tree.root.findAllByProps({ testID: 'protected-passenger' }).length, 0);
    assert.equal(unmounts, 1); assert.ok(clears > 0); assert.equal(routes.at(-1), '/auth?notice=session_expired');
    assert.equal(storage.value(), null);
  } finally { await h.act(async () => tree.unmount()); }
});

test('product access on an internal APK bypasses QA token entry and rejects QA/DEV deep links', async () => {
  const before = { variant: process.env.EXPO_PUBLIC_VIMA_VARIANT, mode: process.env.EXPO_PUBLIC_VIMA_AUTH_MODE };
  process.env.EXPO_PUBLIC_VIMA_VARIANT = 'qa'; process.env.EXPO_PUBLIC_VIMA_AUTH_MODE = 'product';
  const h = createMapHarness({ fileOverrides: {
    'src/features/auth/ProductAuthScreen.tsx': { ProductAuthScreen: () => React.createElement('View', { testID: 'otp-entry' }) },
    'src/features/auth/ProductAccountScreen.tsx': { ProductAccountScreen: () => React.createElement('View', { testID: 'account-entry' }) },
    'src/features/passenger/ProductPassengerScreen.tsx': { __esModule: true, default: () => React.createElement('View', { testID: 'product-passenger' }) },
  }, externalOverrides: { 'expo-router': { Redirect: 'Redirect', useLocalSearchParams: () => ({}) } } });
  try {
    for (const [file, expected] of [['app/index.tsx', './auth'], ['app/qa/passenger.tsx', '/'], ['app/qa/driver.tsx', '/'], ['app/qa/account.tsx', '/'], ['app/dev/driver.tsx', '/'], ['app/dev/passenger.tsx', '/']]) {
      const tree = await h.render(React.createElement(h.load(file).default));
      assert.equal(tree.root.findByType('Redirect').props.href, expected); await h.act(async () => tree.unmount());
    }
    const tree = await h.render(React.createElement(h.load('app/auth.tsx').default));
    assert.equal(tree.root.findAllByProps({ testID: 'otp-entry' }).length, 1); await h.act(async () => tree.unmount());
    assert.throws(() => appVariant({ EXPO_PUBLIC_VIMA_VARIANT: 'production', EXPO_PUBLIC_VIMA_AUTH_MODE: 'qa' }), /production_qa_auth_forbidden/);
    assert.throws(() => appVariant({ EXPO_PUBLIC_VIMA_AUTH_MODE: 'product', EXPO_PUBLIC_VIMA_FIXTURES: '1' }), /product_fixtures_forbidden/);
    assert.equal(appVariant({ EAS_BUILD_PROFILE: 'product-preview', EXPO_PUBLIC_VIMA_VARIANT: 'production', EXPO_PUBLIC_VIMA_AUTH_MODE: 'product' }).suffix, '');
    assert.throws(() => appVariant({ EAS_BUILD_PROFILE: 'product-preview', EXPO_PUBLIC_VIMA_VARIANT: 'qa', EXPO_PUBLIC_VIMA_AUTH_MODE: 'product' }), /inconsistent_build_variant/);
  } finally {
    if (before.variant === undefined) delete process.env.EXPO_PUBLIC_VIMA_VARIANT; else process.env.EXPO_PUBLIC_VIMA_VARIANT = before.variant;
    if (before.mode === undefined) delete process.env.EXPO_PUBLIC_VIMA_AUTH_MODE; else process.env.EXPO_PUBLIC_VIMA_AUTH_MODE = before.mode;
  }
});
