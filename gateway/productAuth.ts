import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { AuthConfig } from './matching/auth.ts';

type User = { accountId: string; phoneHash: string; name: string; createdAt: number; capabilities: ['passenger'] };
type Challenge = { id: string; phoneHash: string; verificationSid: string; expiresAt: number; attempts: number; ipHash: string };
type Grant = { tokenHash: string; phoneHash: string; expiresAt: number };
type Session = { id: string; accountId: string; accessHash: string; refreshHash: string; accessExpiresAt: number; refreshExpiresAt: number; revokedAt?: number };
type Attempt = { phoneHash: string; ipHash: string; sent: number[]; lastSentAt: number };
type State = { version: 1; users: User[]; challenges: Challenge[]; grants: Grant[]; sessions: Session[]; attempts: Attempt[] };

export class ProductAuthError extends Error {
  readonly status: number; readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export interface OtpProvider { start(phone: string): Promise<string>; verify(verificationSid: string, code: string): Promise<boolean> }
export interface ProductAuthOptions { runtimeDir: string; secret: string; provider: OtpProvider; now?: () => number }
const empty = (): State => ({ version: 1, users: [], challenges: [], grants: [], sessions: [], attempts: [] });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const phone = (value: unknown): string => {
  if (typeof value !== 'string') throw new ProductAuthError(400, 'invalid_phone');
  const digits = value.replace(/[ ()-]/g, '');
  const normalized = /^\d{10}$/.test(digits) ? `+52${digits}` : /^\+52\d{10}$/.test(digits) ? digits : '';
  if (!normalized) throw new ProductAuthError(400, 'invalid_phone');
  return normalized;
};
const fields = (value: unknown, allowed: readonly string[]) => {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new ProductAuthError(400, 'invalid_auth_input');
  return value;
};
const token = () => randomBytes(32).toString('base64url');
const tokenHash = (value: string) => createHmac('sha256', value).update('vima-product-session-v1').digest('hex');

function validState(value: unknown): State {
  const fail = (): never => { throw new Error('invalid_product_auth_store'); };
  if (!object(value) || value.version !== 1 || !Array.isArray(value.users) || !Array.isArray(value.challenges) ||
      !Array.isArray(value.grants) || !Array.isArray(value.sessions) || !Array.isArray(value.attempts) ||
      value.users.length > 50_000 || value.challenges.length > 2_000 || value.grants.length > 2_000 ||
      value.sessions.length > 100_000 || value.attempts.length > 100_000) return fail();
  for (const raw of value.users) if (!object(raw) || typeof raw.accountId !== 'string' || !/^[0-9a-f-]{36}$/.test(raw.accountId) ||
    typeof raw.phoneHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.phoneHash) || typeof raw.name !== 'string' || !raw.name.trim() ||
    raw.name.length > 100 || /[\u0000-\u001f<>]/.test(raw.name) || !Number.isSafeInteger(raw.createdAt) || !Array.isArray(raw.capabilities) ||
    raw.capabilities.length !== 1 || raw.capabilities[0] !== 'passenger') return fail();
  for (const raw of value.sessions) if (!object(raw) || typeof raw.id !== 'string' || typeof raw.accountId !== 'string' ||
    typeof raw.accessHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.accessHash) || typeof raw.refreshHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(raw.refreshHash) || !Number.isSafeInteger(raw.accessExpiresAt) || !Number.isSafeInteger(raw.refreshExpiresAt) ||
    raw.revokedAt !== undefined && !Number.isSafeInteger(raw.revokedAt)) return fail();
  for (const raw of value.challenges) if (!object(raw) || typeof raw.id !== 'string' || !/^[0-9a-f-]{36}$/.test(raw.id) ||
    typeof raw.phoneHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.phoneHash) || typeof raw.verificationSid !== 'string' ||
    !/^VE[0-9a-fA-F]{32}$/.test(raw.verificationSid) || !Number.isSafeInteger(raw.expiresAt) || !Number.isSafeInteger(raw.attempts) ||
    typeof raw.ipHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.ipHash)) return fail();
  for (const raw of value.grants) if (!object(raw) || typeof raw.tokenHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.tokenHash) ||
    typeof raw.phoneHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.phoneHash) || !Number.isSafeInteger(raw.expiresAt)) return fail();
  for (const raw of value.attempts) if (!object(raw) || typeof raw.phoneHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.phoneHash) ||
    typeof raw.ipHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.ipHash) || !Array.isArray(raw.sent) ||
    !raw.sent.every(Number.isSafeInteger) || !Number.isSafeInteger(raw.lastSentAt)) return fail();
  const users = value.users as User[]; const sessions = value.sessions as Session[];
  if (new Set(users.map(user => user.accountId)).size !== users.length ||
    new Set(users.map(user => user.phoneHash)).size !== users.length ||
    new Set(sessions.map(session => session.id)).size !== sessions.length ||
    sessions.some(session => !users.some(user => user.accountId === session.accountId))) return fail();
  return value as unknown as State;
}

/** Product OTP/session authority. QA's file-backed createAuthConfig stays independent. */
export function createProductAuth(options: ProductAuthOptions) {
  if (options.secret.length < 32) throw new Error('invalid_product_auth_secret');
  const now = options.now ?? Date.now; const path = join(options.runtimeDir, 'auth-v1.json');
  let state = empty(); let tail = Promise.resolve();
  const digest = (value: string) => createHmac('sha256', options.secret).update(value).digest('hex');
  const run = async <T>(operation: () => Promise<T> | T): Promise<T> => {
    const previous = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    try { return await operation(); } finally { release(); }
  };
  async function save(next: State) {
    await mkdir(options.runtimeDir, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(next), { flag: 'wx', mode: 0o600 });
    await rename(temporary, path); state = next;
  }
  const ready = (async () => {
    try { state = validState(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return; throw new Error('invalid_product_auth_store'); }
  })();
  const accessSession = (bearer: string | undefined): { session: Session; user: User } => {
    if (!bearer || !/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer)) throw new ProductAuthError(401, 'unauthorized');
    const hash = tokenHash(bearer.slice(7)); const session = state.sessions.find(item => item.accessHash === hash && !item.revokedAt && item.accessExpiresAt > now());
    const user = session && state.users.find(item => item.accountId === session.accountId);
    if (!session || !user) throw new ProductAuthError(401, 'unauthorized');
    return { session, user };
  };
  const issue = async (next: State, user: User) => {
    const accessToken = token(); const refreshToken = token(); const created = now(); const id = randomUUID();
    next.sessions = next.sessions.filter(item => !item.revokedAt && item.refreshExpiresAt > created);
    next.sessions.push({ id, accountId: user.accountId, accessHash: tokenHash(accessToken), refreshHash: tokenHash(refreshToken),
      accessExpiresAt: created + 15 * 60_000, refreshExpiresAt: created + 30 * 24 * 60 * 60_000 });
    const active = next.sessions.filter(item => item.accountId === user.accountId && !item.revokedAt && item.refreshExpiresAt > created)
      .sort((a, b) => a.refreshExpiresAt - b.refreshExpiresAt);
    for (const old of active.slice(0, -5)) old.revokedAt = created;
    await save(next);
    return { accountId: user.accountId, displayName: user.name, capabilities: user.capabilities,
      accessToken, refreshToken, accessExpiresIn: 900 };
  };
  const config: AuthConfig = {
    drivers: [],
    principal: accountId => state.users.some(user => user.accountId === accountId) ? { accountId, role: 'passenger' } : undefined,
    profile() { throw new ProductAuthError(403, 'forbidden'); },
    authenticate(header) {
      try { const { user } = accessSession(header); return { accountId: user.accountId, role: 'passenger' }; }
      catch (error) {
        if (header && /^Bearer [A-Za-z0-9_-]{43}$/.test(header)) {
          const hash = tokenHash(header.slice(7)); const user = state.sessions.find(s => s.refreshHash === hash && !s.revokedAt && s.refreshExpiresAt > now());
          if (user) throw new ProductAuthError(401, 'access_token_required');
        }
        throw error;
      }
    },
  };
  return {
    ready, authConfig: config,
    async start(input: unknown, ip: string) {
      await ready; const body = fields(input, ['phone']); const normalized = phone(body.phone); const phoneHash = digest(normalized); const ipHash = digest(ip.slice(0, 128));
      return run(async () => {
        const next = structuredClone(state); const current = now();
        next.attempts = next.attempts.filter(item => item.sent.some(at => at > current - 24 * 60 * 60_000));
        if (next.attempts.length >= 100_000) throw new ProductAuthError(503, 'otp_unavailable');
        let attempts = next.attempts.find(item => item.phoneHash === phoneHash && item.ipHash === ipHash);
        if (!attempts) { attempts = { phoneHash, ipHash, sent: [], lastSentAt: 0 }; next.attempts.push(attempts); }
        const phoneSends = next.attempts.filter(item => item.phoneHash === phoneHash)
          .reduce((sum, item) => sum + item.sent.filter(at => at > current - 60 * 60_000).length, 0);
        if (attempts.lastSentAt > current - 60_000 || phoneSends >= 5)
          throw new ProductAuthError(429, 'otp_rate_limited');
        attempts.sent.push(current); attempts.lastSentAt = current; await save(next);
        let verificationSid: string;
        try { verificationSid = await options.provider.start(normalized); }
        catch { throw new ProductAuthError(503, 'otp_unavailable'); }
        const challengeId = randomUUID(); const stateWithChallenge = structuredClone(state);
        stateWithChallenge.challenges = stateWithChallenge.challenges.filter(item => item.expiresAt > current).slice(-499);
        stateWithChallenge.challenges.push({ id: challengeId, phoneHash, verificationSid, expiresAt: current + 10 * 60_000, attempts: 0, ipHash });
        await save(stateWithChallenge);
        return { challengeId, expiresIn: 600, message: 'Si el número puede recibir SMS, enviaremos un código.' };
      });
    },
    async verify(input: unknown) {
      await ready; const body = fields(input, ['challengeId', 'code']);
      if (typeof body.challengeId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.challengeId) || typeof body.code !== 'string' || !/^\d{4,10}$/.test(body.code))
        throw new ProductAuthError(400, 'invalid_auth_input');
      return run(async () => {
        const next = structuredClone(state); const challenge = next.challenges.find(item => item.id === body.challengeId && item.expiresAt > now());
        if (!challenge || challenge.attempts >= 5) throw new ProductAuthError(400, 'invalid_or_expired_code');
        challenge.attempts++; await save(next);
        let approved = false;
        try { approved = await options.provider.verify(challenge.verificationSid, body.code as string); } catch { throw new ProductAuthError(503, 'otp_unavailable'); }
        if (!approved) throw new ProductAuthError(400, 'invalid_or_expired_code');
        const completed = structuredClone(state); completed.challenges = completed.challenges.filter(item => item.id !== body.challengeId);
        const user = completed.users.find(item => item.phoneHash === challenge.phoneHash);
        if (user) return { status: 'authenticated' as const, session: await issue(completed, user) };
        const registrationToken = token(); completed.grants = completed.grants.filter(item => item.expiresAt > now());
        completed.grants.push({ tokenHash: tokenHash(registrationToken), phoneHash: challenge.phoneHash, expiresAt: now() + 10 * 60_000 });
        completed.grants = completed.grants.slice(-2_000);
        await save(completed); return { status: 'registration_required' as const, registrationToken };
      });
    },
    async register(input: unknown) {
      await ready; const body = fields(input, ['registrationToken', 'name']);
      if (typeof body.registrationToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.registrationToken) || typeof body.name !== 'string')
        throw new ProductAuthError(400, 'invalid_auth_input');
      const displayName = body.name.trim().replace(/\s+/g, ' ');
      if (displayName.length < 2 || displayName.length > 100 || /[\u0000-\u001f<>]/.test(displayName)) throw new ProductAuthError(400, 'invalid_name');
      return run(async () => {
        const next = structuredClone(state); const hash = tokenHash(body.registrationToken as string);
        const grant = next.grants.find(item => item.tokenHash === hash && item.expiresAt > now());
        if (!grant) throw new ProductAuthError(401, 'registration_expired');
        if (next.users.some(user => user.phoneHash === grant.phoneHash)) throw new ProductAuthError(409, 'account_exists');
        next.grants = next.grants.filter(item => item.tokenHash !== hash);
        const user: User = { accountId: randomUUID(), phoneHash: grant.phoneHash, name: displayName, createdAt: now(), capabilities: ['passenger'] };
        next.users.push(user);
        return { status: 'authenticated' as const, session: await issue(next, user) };
      });
    },
    async refresh(input: unknown) {
      await ready; const body = fields(input, ['refreshToken']);
      if (typeof body.refreshToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.refreshToken)) throw new ProductAuthError(401, 'unauthorized');
      return run(async () => {
        const next = structuredClone(state); const hash = tokenHash(body.refreshToken as string);
        const existing = next.sessions.find(item => item.refreshHash === hash && !item.revokedAt && item.refreshExpiresAt > now());
        const user = existing && next.users.find(item => item.accountId === existing.accountId);
        if (!existing || !user) throw new ProductAuthError(401, 'unauthorized');
        existing.revokedAt = now(); return { status: 'authenticated' as const, session: await issue(next, user) };
      });
    },
    async logout(header: string | undefined) {
      await ready; const { session } = accessSession(header);
      await run(async () => { const next = structuredClone(state); const item = next.sessions.find(value => value.id === session.id);
        if (item && !item.revokedAt) { item.revokedAt = now(); await save(next); } });
      return { status: 'logged_out' as const };
    },
    async me(header: string | undefined) {
      await ready; const { user } = accessSession(header);
      return { accountId: user.accountId, displayName: user.name, capabilities: user.capabilities };
    },
    async handle(request: IncomingMessage, path: string, read: () => Promise<unknown>, reply: (status: number, body: unknown) => void) {
      await ready;
      if (request.method === 'POST' && path === '/v1/auth/otp/start') { reply(202, await this.start(await read(), request.socket.remoteAddress ?? 'unknown')); return true; }
      if (request.method === 'POST' && path === '/v1/auth/otp/verify') { reply(200, await this.verify(await read())); return true; }
      if (request.method === 'POST' && path === '/v1/auth/register') { reply(201, await this.register(await read())); return true; }
      if (request.method === 'POST' && path === '/v1/auth/refresh') { reply(200, await this.refresh(await read())); return true; }
      if (request.method === 'POST' && path === '/v1/auth/logout') { reply(200, await this.logout(request.headers.authorization)); return true; }
      if (request.method === 'GET' && path === '/v1/auth/me') { reply(200, await this.me(request.headers.authorization)); return true; }
      return false;
    },
  };
}

export function createTwilioVerifyProvider(options: { accountSid: string; serviceSid: string; authToken: string; fetcher?: typeof fetch }): OtpProvider {
  if (!/^AC[0-9a-fA-F]{32}$/.test(options.accountSid) || !/^VA[0-9a-fA-F]{32}$/.test(options.serviceSid) || options.authToken.length < 16)
    throw new Error('invalid_twilio_verify_config');
  const fetcher = options.fetcher ?? fetch; const base = `https://verify.twilio.com/v2/Services/${options.serviceSid}`;
  const authorization = `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString('base64')}`;
  async function post(path: string, form: Record<string, string>) {
    const response = await fetcher(`${base}/${path}`, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form), signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('twilio_verify_unavailable');
    return await response.json() as { sid?: unknown; status?: unknown };
  }
  return {
    async start(to) { const value = await post('Verifications', { To: to, Channel: 'sms' });
      if (typeof value.sid !== 'string' || !/^VE[0-9a-fA-F]{32}$/.test(value.sid)) throw new Error('twilio_invalid_response'); return value.sid; },
    async verify(verificationSid, code) { const value = await post('VerificationCheck', { VerificationSid: verificationSid, Code: code }); return value.status === 'approved'; },
  };
}
