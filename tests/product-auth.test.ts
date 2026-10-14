import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createProductAuth, createTwilioVerifyProvider } from '../gateway/productAuth.ts';
import { createGateway } from '../gateway/server.ts';
import { gatewayConfig } from '../gateway/config.ts';
import { createAuthConfig } from '../gateway/matching/auth.ts';
import type { TomTomAdapter } from '../gateway/tomtom.ts';
import { syntheticPricing, syntheticRoute } from './support/pricing-fixture.ts';

const secret = 'test-only-product-auth-secret-at-least-32-bytes';
const sid = 'VE' + 'a'.repeat(32);
function simulator() {
  const sent: string[] = []; const checked: string[] = [];
  return { sent, checked, provider: {
    async start(phone: string) { sent.push(phone); return sid; },
    async verify(verificationSid: string, code: string) { checked.push(`${verificationSid}:${code}`); return code === '123456'; },
  } };
}

test('Mexican OTP onboarding, existing login, passenger-only capability, atomic restart, refresh rotation and revocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-product-auth-')); let now = 1_800_000_000_000;
  const fake = simulator();
  const create = () => createProductAuth({ runtimeDir: directory, secret, provider: fake.provider, now: () => now });
  try {
    const auth = create(); await auth.ready;
    const first = await auth.start({ phone: '712 123 4567' }, 'test-ip');
    assert.equal(fake.sent[0], '+527121234567');
    assert.equal((await auth.verify({ challengeId: first.challengeId, code: '123456' })).status, 'registration_required');
    const grant = await auth.start({ phone: '+527121234567' }, 'another-ip');
    const challenge = (await readFile(join(directory, 'auth-v1.json'), 'utf8'));
    assert.doesNotMatch(challenge, /\+527121234567/); // Only an HMAC phone key is persisted.
    const verification = JSON.parse(challenge) as { challenges: { id: string }[] };
    const newAccount = await auth.verify({ challengeId: verification.challenges.find(item => item.id === grant.challengeId)!.id, code: '123456' });
    assert.equal(newAccount.status, 'registration_required');
    if (newAccount.status !== 'registration_required') assert.fail();
    const registered = await auth.register({ registrationToken: newAccount.registrationToken, name: '  María   López ' });
    assert.equal(registered.status, 'authenticated');
    assert.deepEqual(registered.session.capabilities, ['passenger']);
    assert.deepEqual(auth.authConfig.principal(registered.session.accountId), { accountId: registered.session.accountId, role: 'passenger' });
    assert.throws(() => auth.authConfig.profile(registered.session.accountId), /forbidden/);
    assert.equal(auth.authConfig.authenticate(`Bearer ${registered.session.accessToken}`).accountId, registered.session.accountId);
    const store = JSON.parse(await readFile(join(directory, 'auth-v1.json'), 'utf8'));
    assert.equal(store.version, 1); assert.equal(store.users[0].name, 'María López');
    assert.ok(store.sessions.every((item: Record<string, unknown>) => !('accessToken' in item) && !('refreshToken' in item)));

    // Same verified phone now signs in; registration is never offered again.
    now += 61_000;
    const secondChallenge = await auth.start({ phone: '+52 712-123-4567' }, 'test-ip');
    const persistedAuth = create(); await persistedAuth.ready;
    const signedIn = await persistedAuth.verify({ challengeId: secondChallenge.challengeId, code: '123456' });
    assert.equal(signedIn.status, 'authenticated');
    if (signedIn.status !== 'authenticated') assert.fail();
    const refresh = await persistedAuth.refresh({ refreshToken: signedIn.session.refreshToken });
    assert.equal(refresh.status, 'authenticated');
    await assert.rejects(persistedAuth.refresh({ refreshToken: signedIn.session.refreshToken }), /unauthorized/);
    assert.equal(persistedAuth.authConfig.authenticate(`Bearer ${refresh.session.accessToken}`).accountId, registered.session.accountId);
    await persistedAuth.logout(`Bearer ${refresh.session.accessToken}`);
    assert.throws(() => persistedAuth.authConfig.authenticate(`Bearer ${refresh.session.accessToken}`), /unauthorized/);
    assert.equal(fake.checked.length, 3);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('OTP enforces phone-wide rate limits and bounded verification attempts without leaking account existence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-product-auth-rate-')); let now = 1_800_000_000_000;
  const fake = simulator(); const auth = createProductAuth({ runtimeDir: directory, secret, provider: fake.provider, now: () => now });
  try {
    await auth.ready; let last = '';
    for (let i = 0; i < 5; i++) { last = (await auth.start({ phone: '+527121234567' }, `ip-${i}`)).challengeId; now += 61_000; }
    await assert.rejects(auth.start({ phone: '+527121234567' }, 'different-ip'), /otp_rate_limited/);
    for (let i = 0; i < 5; i++) await assert.rejects(auth.verify({ challengeId: last, code: '000000' }), /invalid_or_expired_code/);
    await assert.rejects(auth.verify({ challengeId: last, code: '123456' }), /invalid_or_expired_code/);
    assert.equal(fake.checked.length, 5);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('expired OTP challenge is rejected before calling the verification provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-product-auth-expiry-')); let now = 1_800_000_000_000;
  const fake = simulator(); const auth = createProductAuth({ runtimeDir: directory, secret, provider: fake.provider, now: () => now });
  try {
    await auth.ready;
    const challenge = await auth.start({ phone: '7121234567' }, 'test-ip');
    now += 10 * 60_000;
    await assert.rejects(auth.verify({ challengeId: challenge.challengeId, code: '123456' }), /invalid_or_expired_code/);
    assert.equal(fake.checked.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('serialized concurrent OTP writes produce one valid atomic auth-v1 store; corrupt stores fail closed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-product-auth-serial-')); const fake = simulator();
  try {
    const auth = createProductAuth({ runtimeDir: directory, secret, provider: fake.provider }); await auth.ready;
    await Promise.all([auth.start({ phone: '7121234567' }, 'ip-a'), auth.start({ phone: '7221234567' }, 'ip-b')]);
    const state = JSON.parse(await readFile(join(directory, 'auth-v1.json'), 'utf8')) as { challenges: unknown[]; attempts: unknown[] };
    assert.equal(state.challenges.length, 2); assert.equal(state.attempts.length, 2);
    const reloaded = createProductAuth({ runtimeDir: directory, secret, provider: fake.provider }); await reloaded.ready;
    await writeFile(join(directory, 'auth-v1.json'), '{invalid');
    await assert.rejects(createProductAuth({ runtimeDir: directory, secret, provider: fake.provider }).ready, /invalid_product_auth_store/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Twilio Verify adapter uses the documented HTTPS service endpoints and form fields', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const provider = createTwilioVerifyProvider({ accountSid: 'AC' + 'a'.repeat(32), serviceSid: 'VA' + 'b'.repeat(32), authToken: 'test-auth-token-123456',
    fetcher: async (input, init) => { calls.push({ url: String(input), init: init! }); return Response.json(calls.length === 1
      ? { sid, status: 'pending' } : { sid, status: 'approved' }); } });
  assert.equal(await provider.start('+527121234567'), sid);
  assert.equal(await provider.verify(sid, '123456'), true);
  assert.match(calls[0]!.url, /verify\.twilio\.com\/v2\/Services\/VA/);
  assert.ok(calls[0]!.url.endsWith('/Verifications')); assert.ok(calls[1]!.url.endsWith('/VerificationCheck'));
  assert.match(new URLSearchParams(String(calls[0]!.init.body)).toString(), /To=%2B527121234567&Channel=sms/);
  assert.match(String(calls[1]!.init.body), /VerificationSid=VE/); assert.match(String(calls[1]!.init.body), /Code=123456/);
  assert.equal(new Headers(calls[0]!.init.headers).get('Authorization')?.slice(0, 6), 'Basic ');
});

test('only exact product auth methods are routed publicly; matching remains bearer-authenticated and passenger-scoped', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-product-auth-http-')); const fake = simulator();
  const productAuth = createProductAuth({ runtimeDir: directory, secret, provider: fake.provider });
  const server = createGateway({ ...gatewayConfig({}), runtimeDir: directory, rateLimit: 500 },
    { route: async () => syntheticRoute } as unknown as TomTomAdapter,
    { configured: true, productAuth, auth: createAuthConfig({ accounts: [{ accountId: 'qa-passenger', token: 'qa-token-that-is-long-enough-for-tests', role: 'passenger' }] }),
      pricing: { status: 'ready', config: syntheticPricing() } });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = async (path: string, method = 'GET', body?: unknown, bearer?: string) => {
      const response = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() as Record<string, any> };
    };
    assert.equal((await call('/v1/auth/not-a-route', 'POST', {})).status, 404);
    assert.equal((await call('/v1/auth/me')).status, 401);
    const started = await call('/v1/auth/otp/start', 'POST', { phone: '+527121234567' }); assert.equal(started.status, 202);
    const verified = await call('/v1/auth/otp/verify', 'POST', { challengeId: started.body.challengeId, code: '123456' });
    assert.equal(verified.body.status, 'registration_required');
    const registered = await call('/v1/auth/register', 'POST', { registrationToken: verified.body.registrationToken, name: 'Pasajera QA' });
    assert.equal(registered.status, 201); const access = registered.body.session.accessToken as string;
    assert.equal((await call('/v1/auth/me', 'GET', undefined, access)).body.capabilities[0], 'passenger');
    assert.equal((await call('/v1/auth/refresh', 'GET')).status, 404);
    const rotated = await call('/v1/auth/refresh', 'POST', { refreshToken: registered.body.session.refreshToken });
    assert.equal(rotated.status, 200);
    assert.equal((await call('/v1/auth/me', 'GET', undefined, access)).status, 401);
    const activeAccess = rotated.body.session.accessToken as string;
    assert.equal((await call('/v1/auth/me', 'GET', undefined, activeAccess)).status, 200);
    assert.equal((await call('/v1/matching/session')).status, 401);
    assert.equal((await call('/v1/matching/session', 'GET', undefined, 'qa-token-that-is-long-enough-for-tests')).status, 401);
    assert.equal((await call('/v1/matching/session', 'GET', undefined, activeAccess)).body.accountId, registered.body.session.accountId);
    assert.equal((await call('/v1/driver/state', 'GET', undefined, activeAccess)).status, 403);
    assert.equal((await call('/v1/passenger/requests/active', 'GET', undefined, activeAccess)).body, null);
    assert.equal((await call('/v1/auth/logout', 'POST', {}, activeAccess)).status, 200);
    assert.equal((await call('/v1/auth/me', 'GET', undefined, activeAccess)).status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
  }
});

test('QA deployment ignores product OTP authority and preserves the existing QA-auth boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vima-product-auth-qa-')); const fake = simulator();
  const productAuth = createProductAuth({ runtimeDir: directory, secret, provider: fake.provider });
  const auth = createAuthConfig({ accounts: [{ accountId: 'qa-passenger', token: 'qa-token-that-is-long-enough-for-tests', role: 'passenger' }] });
  const server = createGateway({ ...gatewayConfig({ VIMA_BACKEND_MODE: 'qa', VIMA_GEO_RUNTIME_DIR: '/data' }), runtimeDir: directory, rateLimit: 500 },
    { route: async () => syntheticRoute } as unknown as TomTomAdapter,
    { configured: true, productAuth, auth, pricing: { status: 'ready', config: syntheticPricing() } });
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const otp = await fetch(`${base}/v1/auth/otp/start`, { method: 'POST', headers: { 'Content-Type': 'application/json',
      Authorization: 'Bearer qa-token-that-is-long-enough-for-tests', 'X-Forwarded-Proto': 'https' }, body: JSON.stringify({ phone: '+527121234567' }) });
    assert.equal(otp.status, 404); assert.equal(fake.sent.length, 0);
    const matching = await fetch(`${base}/v1/matching/session`, { headers: { Authorization: 'Bearer qa-token-that-is-long-enough-for-tests', 'X-Forwarded-Proto': 'https' } });
    assert.equal(matching.status, 200);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
  }
});
