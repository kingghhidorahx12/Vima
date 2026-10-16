import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductAuthClient, PRODUCT_SESSION_STORAGE_KEY } from '../src/services/auth/productSession.ts';

const sessionFixture = () => ({ accountId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', displayName: 'María López',
  capabilities: ['passenger'], accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43), accessExpiresAt: Date.now() + 900000 });

test('D1 product session preserves server capabilities and forwards context without changing identity or credentials', async () => {
  const original = { ...sessionFixture(), capabilities: ['passenger', 'driver'] };
  let stored: string | null = JSON.stringify(original); let capabilities = original.capabilities;
  const contexts: (string | null)[] = [];
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { stored = value; }, clear: async () => { stored = null; } }, async (input, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${original.accessToken}`);
    if (new URL(String(input)).pathname === '/v1/auth/me') return Response.json({ ...original, capabilities });
    contexts.push(new Headers(init?.headers).get('X-Vima-Operational-Context'));
    return Response.json({ accountId: original.accountId });
  });
  assert.deepEqual((await client.current())?.capabilities, ['passenger', 'driver']);
  await client.api.request({ path: '/v1/driver/state', method: 'GET', operationalContext: 'driver', decode: x => x });
  await client.api.request({ path: '/v1/passenger/requests/active', method: 'GET', operationalContext: 'passenger', decode: x => x });
  assert.deepEqual(contexts, ['driver', 'passenger']);
  capabilities = ['passenger'];
  // A new bootstrap reads current authority even if the persisted token still lists Driver.
  const restored = createProductAuthClient('https://gateway.example', { read: async () => stored, write: async () => {}, clear: async () => {} },
    async () => Response.json({ ...original, capabilities }));
  assert.deepEqual((await restored.current())?.capabilities, ['passenger']);
  assert.equal((await restored.current())?.accountId, original.accountId);
});

test('cold restoration gives storage, refresh and me separate budgets instead of spending the me deadline on credentials', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_800_000_000_000 });
  const original = { ...sessionFixture(), accessExpiresAt: Date.now() - 1 };
  let stored: string | null = JSON.stringify(original); let reads = 0; let refreshes = 0; let me = 0;
  const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const drain = async () => { for (let i=0;i<40;i++) await Promise.resolve(); };
  const client = createProductAuthClient('https://gateway.example', {
    read: async () => { reads++; await delay(6000); return stored; },
    write: async value => { await delay(1000); stored = value; }, clear: async () => { stored = null; },
  }, async input => {
    if (new URL(String(input)).pathname === '/v1/auth/refresh') {
      refreshes++; await delay(7000);
      return Response.json({ status: 'authenticated', session: { ...original, accessExpiresIn: 900 } });
    }
    me++; await delay(5000); return Response.json(original);
  });
  let complete = false; const restored = client.current().then(value => { complete = true; return value; });
  await drain(); t.mock.timers.tick(6000); await drain();
  t.mock.timers.tick(7000); await drain(); t.mock.timers.tick(1000); await drain();
  assert.equal(me, 1); assert.equal(complete, false);
  t.mock.timers.tick(5000); await drain();
  assert.equal((await restored)?.accountId, original.accountId);
  assert.deepEqual([reads,refreshes,me], [1,1,1]);
});

test('cancelling while waiting for shared refresh prevents me but permits a fresh caller to finish restoration', async () => {
  const original = { ...sessionFixture(), accessExpiresAt: Date.now() - 1 };
  let finish!: (value: Response) => void; let calls = 0; let stored: string | null = JSON.stringify(original);
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { stored = value; }, clear: async () => { stored = null; } }, async input => {
    if (new URL(String(input)).pathname === '/v1/auth/refresh') return new Promise<Response>(resolve => { finish=resolve; });
    calls++; return Response.json(original);
  });
  const controller = new AbortController(); const first = client.current(controller.signal);
  const rejected = assert.rejects(first); while (!finish) await new Promise<void>(resolve => setImmediate(resolve));
  controller.abort(); await rejected;
  const next = client.current();
  finish(Response.json({ status:'authenticated', session:{ ...original, accessExpiresIn:900 } }));
  assert.equal((await next)?.accountId,original.accountId); assert.equal(calls,1); assert.ok(stored);
});

test('a refresh started before logout cannot recreate the product session when its response arrives late', async () => {
  const original = sessionFixture(); let stored: string | null = JSON.stringify(original);
  let respond!: (response: Response) => void;
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { stored = value; }, clear: async () => { stored = null; } }, async input => {
    const path = new URL(String(input)).pathname;
    if (path === '/v1/auth/refresh') return new Promise<Response>(resolve => { respond = resolve; });
    if (path === '/v1/auth/logout') return Response.json({ status: 'logged_out' });
    return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
  });
  const request = client.api.request({ path: '/probe', method: 'GET', decode: value => value });
  const rejected = assert.rejects(request, /auth_cancelled/);
  while (!respond) await new Promise<void>(resolve => setImmediate(resolve));
  await client.logout(); assert.equal(stored, null);
  respond(Response.json({ status: 'authenticated', session: { ...original, accessToken: 'c'.repeat(43), refreshToken: 'd'.repeat(43), accessExpiresIn: 900 } }));
  await rejected; assert.equal(stored, null); assert.equal(await client.current(), null);
});

test('late unauthorized validation of the old account cannot refresh or remove a newly accepted account', async () => {
  const original = sessionFixture(); const next = { ...original, accountId: '5c4af628-59c0-4a72-9575-bd77355b265b', displayName: 'Otra cuenta' };
  let stored: string | null = JSON.stringify(original); let respond!: (response: Response) => void; let refreshCalls = 0;
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { stored = value; }, clear: async () => { stored = null; } }, async input => {
    const path = new URL(String(input)).pathname;
    if (path === '/v1/auth/me') return new Promise<Response>(resolve => { respond = resolve; });
    if (path === '/v1/auth/otp/verify') return Response.json({ status: 'authenticated', session: { ...next, accessExpiresIn: 900 } });
    refreshCalls++; return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
  });
  const validating = client.current(); const rejected = assert.rejects(validating, /auth_cancelled/);
  while (!respond) await new Promise<void>(resolve => setImmediate(resolve));
  await client.verifyOtp('challenge', '123456');
  respond(Response.json({ error: { code: 'unauthorized' } }, { status: 401 }));
  await rejected;
  assert.equal(refreshCalls, 0); assert.equal(JSON.parse(stored!).accountId, next.accountId);
  assert.equal((await client.current())?.accountId, next.accountId);
});

test('genuine current-generation expired refresh still clears its own session and returns unauthenticated', async () => {
  let stored: string | null = JSON.stringify({ ...sessionFixture(), accessExpiresAt: Date.now() - 1000 });
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { stored = value; }, clear: async () => { stored = null; } }, async input => {
    assert.equal(new URL(String(input)).pathname, '/v1/auth/refresh');
    return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
  });
  assert.equal(await client.current(), null); assert.equal(stored, null);
});

test('late registration grant from OTP verification is also discarded after logout', async () => {
  let respond!: (response: Response) => void;
  const client = createProductAuthClient('https://gateway.example', { read: async () => null,
    write: async () => assert.fail('no session should be written'), clear: async () => {} },
    async () => new Promise<Response>(resolve => { respond = resolve; }));
  const verifying = client.verifyOtp('challenge', '123456'); const rejected = assert.rejects(verifying, /auth_cancelled/);
  while (!respond) await new Promise<void>(resolve => setImmediate(resolve));
  await client.logout();
  respond(Response.json({ status: 'registration_required', registrationToken: 'r'.repeat(43) }));
  await rejected; assert.equal(await client.current(), null);
});

test('product session stays in a separate SecureStore namespace and refreshes after cold-start access expiry', async () => {
  let now = 1_800_000_000_000;
  let stored = JSON.stringify({ accountId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', displayName: 'María López',
    capabilities: ['passenger'], accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43), accessExpiresAt: now - 1000 });
  let refreshCalls = 0; let seenAccess = '';
  const storage = { async read() { return stored; }, async write(value: string) { stored = value; }, async clear() { stored = ''; } };
  const client = createProductAuthClient('https://gateway.example', storage, async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/auth/refresh') {
      refreshCalls++;
      assert.equal(JSON.parse(String(init?.body)).refreshToken, 'b'.repeat(43));
      return Response.json({ status: 'authenticated', session: { accountId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        displayName: 'María López', capabilities: ['passenger'], accessToken: 'c'.repeat(43), refreshToken: 'd'.repeat(43), accessExpiresIn: 900 } });
    }
    if (url.pathname === '/v1/auth/me') {
      seenAccess = new Headers(init?.headers).get('Authorization') ?? '';
      return Response.json({ accountId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', displayName: 'María López', capabilities: ['passenger'] });
    }
    throw new Error('unexpected_endpoint');
  }, () => now);

  assert.equal(PRODUCT_SESSION_STORAGE_KEY, 'vima.product-session.v1');
  assert.notEqual(PRODUCT_SESSION_STORAGE_KEY, 'vima.session-credential');
  assert.equal((await client.current())?.displayName, 'María López');
  assert.equal(refreshCalls, 1);
  assert.equal(seenAccess, `Bearer ${'c'.repeat(43)}`);
  assert.equal(JSON.parse(stored).refreshToken, 'd'.repeat(43));
  now += 1000;
  assert.equal((await client.current())?.accountId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479');
  assert.equal(refreshCalls, 1); // cached validation prevents a duplicate /me bootstrap.
});

test('product auth transport distinguishes timeout from connectivity failure without exposing response bodies', async () => {
  const storage = { async read() { return null; }, async write() {}, async clear() {} };
  const timeout = createProductAuthClient('https://gateway.example', storage,
    async () => { throw new DOMException('network timeout', 'TimeoutError'); });
  await assert.rejects(timeout.startOtp('7121234567'), (error: unknown) =>
    error instanceof Error && 'code' in error && error.code === 'timeout');
  const offline = createProductAuthClient('https://gateway.example', storage, async () => { throw new TypeError('offline'); });
  await assert.rejects(offline.startOtp('7121234567'), (error: unknown) =>
    error instanceof Error && 'code' in error && error.code === 'network_recoverable');
});

test('OTP UI cancellation cannot store a late successful session; logout clears product storage even offline', async () => {
  let stored: string | null = null; let respond!: (response: Response) => void;
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { stored = value; }, clear: async () => { stored = null; } },
    async () => new Promise<Response>(resolve => { respond = resolve; }));
  const controller = new AbortController();
  const verifying = client.verifyOtp('c', '123456', controller.signal);
  while (!respond) await new Promise<void>(resolve => setImmediate(resolve));
  controller.abort();
  respond(Response.json({ status: 'authenticated', session: { accountId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', displayName: 'Nombre real',
    capabilities: ['passenger'], accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43), accessExpiresIn: 900 } }));
  await assert.rejects(verifying, /auth_cancelled/); assert.equal(stored, null);
  const offline = createProductAuthClient('https://gateway.example', { read: async () => JSON.stringify({
    accountId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', displayName: 'Nombre real', capabilities: ['passenger'],
    accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43), accessExpiresAt: Date.now() + 900000 }),
    write: async () => {}, clear: async () => { stored = null; } }, async () => { throw new TypeError('offline'); });
  stored = 'preserved'; await assert.rejects(offline.logout()); assert.equal(stored, null);
});

test('back during a native session write restores the existing session instead of removing its credentials', async () => {
  const original = sessionFixture(); let stored = JSON.stringify(original); let writes = 0;
  let writing!: () => void; const began = new Promise<void>(resolve => { writing = resolve; });
  let finish!: () => void; const pendingWrite = new Promise<void>(resolve => { finish = resolve; });
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { writes++; stored = value; if (writes === 1) { writing(); await pendingWrite; } }, clear: async () => { stored = ''; } },
    async () => Response.json({ status: 'authenticated', session: { ...original, accessToken: 'c'.repeat(43), refreshToken: 'd'.repeat(43), accessExpiresIn: 900 } }));
  const controller = new AbortController(); const attempt = client.verifyOtp('challenge', '123456', controller.signal);
  await began; controller.abort(); finish();
  await assert.rejects(attempt, /auth_cancelled/);
  assert.deepEqual(JSON.parse(stored), original); assert.equal(writes, 2);
});

test('a cancelled account validation does not refresh, clear credentials or cache a late identity', async () => {
  const original = sessionFixture(); let stored = JSON.stringify(original); let meCalls = 0; let respond!: (response: Response) => void;
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { stored = value; }, clear: async () => { stored = ''; } }, async input => {
    assert.equal(new URL(String(input)).pathname, '/v1/auth/me'); meCalls++;
    return new Promise<Response>(resolve => { respond = resolve; });
  });
  const controller = new AbortController(); const attempt = client.current(controller.signal);
  while (!meCalls) await new Promise<void>(resolve => setImmediate(resolve));
  controller.abort(); await assert.rejects(attempt); respond(Response.json({ error: { code: 'unauthorized' } }, { status: 401 }));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(stored), original); assert.equal(meCalls, 1);
});

test('a late /me cannot restore identity after logout; native clear failure instead allows a retry', async () => {
  const original = sessionFixture(); let stored: string | null = JSON.stringify(original); let respond!: (response: Response) => void;
  let meCalls = 0; let failClear = true;
  const client = createProductAuthClient('https://gateway.example', { read: async () => stored,
    write: async value => { stored = value; }, clear: async () => { if (failClear) throw new Error('native storage'); stored = null; } }, async input => {
    if (new URL(String(input)).pathname === '/v1/auth/me') { meCalls++; return new Promise<Response>(resolve => { respond = resolve; }); }
    return Response.json({ status: 'logged_out' });
  });
  const validating = client.current();
  while (!meCalls) await new Promise<void>(resolve => setImmediate(resolve));
  await assert.rejects(client.logout(), (error: unknown) => error instanceof Error && 'code' in error && error.code === 'session_storage_unavailable');
  assert.equal(stored, JSON.stringify(original)); failClear = false;
  await client.logout(); assert.equal(stored, null);
  respond(Response.json({ accountId: original.accountId, displayName: original.displayName, capabilities: original.capabilities }));
  assert.equal(await validating, null); assert.equal(await client.current(), null);
});
