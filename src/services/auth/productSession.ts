import { ApiError, createApiClient, type ApiClient, type ApiRequest } from '../api/client.ts';
import { RequestTimeoutError, withDeadline } from '../api/deadline.ts';

export const PRODUCT_SESSION_STORAGE_KEY = 'vima.product-session.v1';
export interface ProductSession { accountId: string; displayName: string; capabilities: readonly ['passenger'];
  accessToken: string; refreshToken: string; accessExpiresAt: number }
export interface ProductAccount { accountId: string; displayName: string; capabilities: readonly ['passenger'] }
interface ProductSessionStorage { read(): Promise<string | null>; write(value: string): Promise<void>; clear(): Promise<void> }
const secureStorage: ProductSessionStorage = {
  async read() { const store = await import('expo-secure-store'); return store.getItemAsync(PRODUCT_SESSION_STORAGE_KEY,
    { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); },
  async write(value) { const store = await import('expo-secure-store'); await store.setItemAsync(PRODUCT_SESSION_STORAGE_KEY, value,
    { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); },
  async clear() { const store = await import('expo-secure-store'); await store.deleteItemAsync(PRODUCT_SESSION_STORAGE_KEY,
    { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); },
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function sessionValue(value: unknown, now: number, allowExpiredAccess = false): ProductSession {
  if (!object(value) || typeof value.accountId !== 'string' || !/^[0-9a-f-]{36}$/.test(value.accountId) ||
    typeof value.displayName !== 'string' || !value.displayName.trim() || !Array.isArray(value.capabilities) ||
    value.capabilities.length !== 1 || value.capabilities[0] !== 'passenger' || typeof value.accessToken !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.accessToken) || typeof value.refreshToken !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.refreshToken) || !Number.isSafeInteger(value.accessExpiresAt) ||
    (!allowExpiredAccess && (value.accessExpiresAt as number) <= now)) throw new Error('invalid_product_session');
  return { accountId: value.accountId, displayName: value.displayName, capabilities: ['passenger'], accessToken: value.accessToken,
    refreshToken: value.refreshToken, accessExpiresAt: value.accessExpiresAt as number };
}
export class ProductAuthClientError extends ApiError {
  override readonly code: string;
  constructor(status: number, code: string) { super(status, code); this.code = code; this.message = code; }
}
export interface ProductSessionState {
  readonly generation: number;
  readonly status: 'unknown' | 'authenticated' | 'closing' | 'signed-out' | 'storage-blocked';
  readonly reason?: 'expired' | 'logout' | 'storage';
}

/** Dedicated SecureStore namespace; it never reads or writes QA credentials. */
export function createProductAuthClient(baseUrl: string, storage: ProductSessionStorage = secureStorage,
  fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('product_auth_requires_https');
  let session: ProductSession | undefined; let loaded: Promise<ProductSession | undefined> | undefined;
  let refreshing: Promise<ProductSession> | undefined;
  let currentAccount: ProductAccount | null | undefined;
  // Only local identity replacement/logout invalidate older auth work; token rotation does not.
  let identityGeneration = 0;
  let snapshot: ProductSessionState = { generation: 0, status: 'unknown' };
  const listeners = new Set<() => void>();
  const publish = (status: ProductSessionState['status'], reason?: ProductSessionState['reason']) => {
    snapshot = { generation: identityGeneration, status, ...(reason ? { reason } : {}) };
    listeners.forEach(listener => listener());
  };
  const forget = (reason: ProductSessionState['reason']) => {
    identityGeneration++; session = undefined; loaded = Promise.resolve(undefined); currentAccount = null;
    publish(reason === 'storage' ? 'storage-blocked' : 'signed-out', reason);
  };
  let writing = Promise.resolve();
  let storageBlocked = false;
  let cleanupRequired = false;
  const serializeSession = async <T>(operation: () => Promise<T>): Promise<T> => {
    const work = writing.then(operation);
    // Native mutations cannot be cancelled. Keep the raw tail, even after the UI deadline.
    const tail = work.then(() => {}, () => {}); writing = tail;
    void tail.then(() => { if (writing === tail) storageBlocked = false; });
    try { return await withDeadline(work, 8000, undefined, () => {
      storageBlocked = true; cleanupRequired = true; forget('storage');
    }); } catch (error) {
      if (error instanceof RequestTimeoutError) throw new ProductAuthClientError(0, 'session_storage_unavailable');
      throw error;
    }
  };
  const clearSession = async () => {
    cleanupRequired = true;
    try { await serializeSession(async () => { await storage.clear(); cleanupRequired = false; }); }
    catch { publish('storage-blocked', 'storage'); throw new ProductAuthClientError(0, 'session_storage_unavailable'); }
  };
  const requireStorage = async () => {
    if (storageBlocked) throw new ProductAuthClientError(0, 'session_storage_unavailable');
    if (cleanupRequired) await clearSession();
  };
  const load = async (): Promise<ProductSession | undefined> => {
    await requireStorage();
    const generation = identityGeneration;
    return loaded ??= withDeadline(storage.read(), 8000).then(async value => {
      if (generation !== identityGeneration) return session;
      if (!value) return undefined;
      // An expired access token can still have a live refresh token. Keep the
      // validated record so the first authenticated request can rotate it.
      try { session = sessionValue(JSON.parse(value), now(), true); return session; }
      catch { session = undefined; await clearSession(); return undefined; }
    }).catch(error => { if (generation === identityGeneration) loaded = undefined; throw error; });
  };
  const endpoint = (path: string) => {
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new Error('product_auth_origin_mismatch');
    return url.toString();
  };
  async function publicRequest<T>(path: string, method: 'GET' | 'POST', body?: unknown, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController(); const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
    try {
      return await withDeadline((async () => {
        const response = await fetcher(endpoint(path), { method, signal: controller.signal, headers: {
          Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        let value: unknown;
        try { value = await response.json(); } catch { throw new ProductAuthClientError(response.status, 'invalid_auth_response'); }
        if (signal?.aborted) throw new Error('auth_cancelled');
        if (!response.ok) {
          const code = object(value) && object(value.error) && typeof value.error.code === 'string' ? value.error.code : 'auth_unavailable';
          throw new ProductAuthClientError(response.status, code);
        }
        return value as T;
      })(), 12_000, signal, abort);
    } catch (error) {
      if (signal?.aborted) throw new Error('auth_cancelled');
      if (error instanceof ProductAuthClientError) throw error;
      throw new ProductAuthClientError(0, controller.signal.aborted || error instanceof Error && ['TimeoutError', 'RequestTimeoutError'].includes(error.name) ? 'timeout' : 'network_recoverable');
    } finally { signal?.removeEventListener('abort', abort); }
  }
  async function accept(raw: unknown, signal?: AbortSignal, generation = identityGeneration, replacesIdentity = false): Promise<ProductSession> {
    if (snapshot.status === 'closing') throw new Error('auth_cancelled');
    if (!object(raw) || typeof raw.accessToken !== 'string' || typeof raw.refreshToken !== 'string' ||
      !Number.isSafeInteger(raw.accessExpiresIn) ||
      typeof raw.accountId !== 'string' || typeof raw.displayName !== 'string' || !Array.isArray(raw.capabilities))
      throw new ProductAuthClientError(502, 'invalid_auth_response');
    const next = sessionValue({ ...raw, accessExpiresAt: now() + (raw.accessExpiresIn as number) * 1000 }, now());
    await requireStorage();
    const previous = await load();
    return serializeSession(async () => {
      if (signal?.aborted || generation !== identityGeneration || snapshot.status === 'closing') throw new Error('auth_cancelled');
      try { await storage.write(JSON.stringify(next)); }
      catch { cleanupRequired = true; forget('storage'); throw new ProductAuthClientError(0, 'session_storage_unavailable'); }
      if (signal?.aborted || generation !== identityGeneration) {
        // Back may restore the same still-valid identity. Logout/revocation/timeout may NEVER do so.
        if (previous && generation === identityGeneration) await storage.write(JSON.stringify(previous));
        else { await storage.clear(); cleanupRequired = false; }
        throw new Error('auth_cancelled');
      }
      session = next; loaded = Promise.resolve(next);
      if (replacesIdentity) identityGeneration++;
      currentAccount = { accountId: next.accountId, displayName: next.displayName, capabilities: ['passenger'] };
      publish('authenticated');
      return next;
    });
  }
  async function refresh(): Promise<ProductSession> {
    if (refreshing) return refreshing;
    const generation = identityGeneration;
    refreshing = (async () => {
      const current = await load();
      if (generation !== identityGeneration) throw new Error('auth_cancelled');
      if (!current) throw new ProductAuthClientError(401, 'unauthorized');
      try {
        const value = await publicRequest<{ status: string; session: unknown }>('/v1/auth/refresh', 'POST', { refreshToken: current.refreshToken });
        if (value.status !== 'authenticated') throw new ProductAuthClientError(502, 'invalid_auth_response');
        return await accept(value.session, undefined, generation);
      } catch (error) {
        if (generation !== identityGeneration) throw new Error('auth_cancelled');
        if (error instanceof ProductAuthClientError && error.status === 401) {
          forget('expired'); await clearSession();
        }
        throw error;
      }
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  }
  const access = async () => {
    const current = await load();
    if (!current) throw new ProductAuthClientError(401, 'unauthorized');
    return (current.accessExpiresAt > now() + 60_000 ? current : await refresh()).accessToken;
  };
  const rawApi = createApiClient(baseUrl, access, { fetcher });
  const requestWithTimeout = async <T>(request: ApiRequest<T>) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (request.signal?.aborted) controller.abort();
    else request.signal?.addEventListener('abort', abort, { once: true });
    try {
      return await withDeadline(rawApi.request({ ...request, signal: controller.signal }), request.timeoutMs ?? 12_000, request.signal, abort);
    } catch (error) {
      if (!request.signal?.aborted && controller.signal.aborted) throw new ProductAuthClientError(0, 'timeout');
      if (error instanceof ApiError || error instanceof ProductAuthClientError || !(error instanceof TypeError)) throw error;
      if (request.signal?.aborted) throw error;
      throw new ProductAuthClientError(0, 'network_recoverable');
    } finally {
      request.signal?.removeEventListener('abort', abort);
    }
  };
  const api: ApiClient = { async request<T>(request: ApiRequest<T>) {
    const generation = identityGeneration;
    let result: T;
    try { result = await requestWithTimeout(request); }
    catch (error) {
      if (request.signal?.aborted) throw error;
      if (error instanceof ProductAuthClientError && error.status === 401 && snapshot.reason === 'expired') throw error;
      if (generation !== identityGeneration) throw new Error('auth_cancelled');
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      await refresh();
      if (generation !== identityGeneration) throw new Error('auth_cancelled');
      try { result = await requestWithTimeout(request); }
      catch (retryError) {
        if (generation === identityGeneration && retryError instanceof ApiError && retryError.status === 401) {
          forget('expired'); await clearSession();
        }
        throw retryError;
      }
    }
    if (generation !== identityGeneration) throw new Error('auth_cancelled');
    return result;
  } };
  return {
    api,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async mediaHeaders(uri: string, signal?: AbortSignal) {
      const url = new URL(uri);
      if (url.origin !== base.origin || !url.pathname.startsWith('/v1/media/place-images/')) throw new Error('product_media_origin_mismatch');
      const generation = identityGeneration;
      const credential = await withDeadline(access(), 12_000, signal);
      if (signal?.aborted || generation !== identityGeneration) throw new Error('auth_cancelled');
      return { Authorization: `Bearer ${credential}` };
    },
    async startOtp(phone: string, signal?: AbortSignal) {
      await requireStorage();
      const value = await publicRequest<{ challengeId: string; expiresIn: number }>('/v1/auth/otp/start', 'POST', { phone }, signal);
      if (typeof value.challengeId !== 'string' || !/^[0-9a-f-]{36}$/.test(value.challengeId)) throw new ProductAuthClientError(502, 'invalid_auth_response');
      if (!Number.isSafeInteger(value.expiresIn) || value.expiresIn <= 0 || value.expiresIn > 600) throw new ProductAuthClientError(502, 'invalid_auth_response');
      return { challengeId: value.challengeId, expiresIn: value.expiresIn };
    },
    async verifyOtp(challengeId: string, code: string, signal?: AbortSignal) {
      const generation = identityGeneration;
      await requireStorage();
      if (snapshot.status === 'closing') throw new Error('auth_cancelled');
      const value = await publicRequest<{ status: string; session?: unknown; registrationToken?: string }>('/v1/auth/otp/verify', 'POST', { challengeId, code }, signal);
      if (generation !== identityGeneration) throw new Error('auth_cancelled');
      if (value.status === 'authenticated' && value.session) return { status: 'authenticated' as const, session: await accept(value.session, signal, generation, true) };
      if (value.status === 'registration_required' && typeof value.registrationToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.registrationToken))
        return { status: 'registration_required' as const, registrationToken: value.registrationToken };
      throw new ProductAuthClientError(502, 'invalid_auth_response');
    },
    async register(registrationToken: string, name: string, signal?: AbortSignal) {
      const generation = identityGeneration;
      await requireStorage();
      if (snapshot.status === 'closing') throw new Error('auth_cancelled');
      const value = await publicRequest<{ status: string; session: unknown }>('/v1/auth/register', 'POST', { registrationToken, name }, signal);
      if (value.status !== 'authenticated') throw new ProductAuthClientError(502, 'invalid_auth_response');
      return await accept(value.session, signal, generation, true);
    },
    async current(signal?: AbortSignal): Promise<ProductAccount | null> {
      const generation = identityGeneration;
      if (signal?.aborted) throw new Error('auth_cancelled');
      await requireStorage();
      if (currentAccount !== undefined) return currentAccount;
      if (!await load()) return null;
      try {
        const account = await api.request({ path: '/v1/auth/me', method: 'GET', signal, decode: raw => {
          if (!object(raw) || typeof raw.accountId !== 'string' || typeof raw.displayName !== 'string' ||
            !Array.isArray(raw.capabilities) || raw.capabilities.length !== 1 || raw.capabilities[0] !== 'passenger')
            throw new ProductAuthClientError(502, 'invalid_auth_response');
          return { accountId: raw.accountId, displayName: raw.displayName, capabilities: ['passenger'] as const };
        } });
        if (signal?.aborted) throw new Error('auth_cancelled');
        if (!session) return null; // A logout during /me cannot restore a cached identity.
        if (generation !== identityGeneration) throw new Error('auth_cancelled');
        if (account.accountId !== session.accountId) throw new ProductAuthClientError(502, 'invalid_auth_response');
        currentAccount = account;
        publish('authenticated');
        return account;
      } catch (error) {
        if (signal?.aborted) throw error;
        if (error instanceof ProductAuthClientError && error.status === 401 && snapshot.reason === 'expired') return null;
        if (currentAccount === null && snapshot.reason === 'logout') return null;
        if (generation !== identityGeneration) throw new Error('auth_cancelled');
        if (error instanceof ApiError && error.status === 401 || error instanceof ProductAuthClientError && error.status === 401) {
          forget('expired'); await clearSession(); return null;
        }
        throw error;
      }
    },
    async logout() {
      identityGeneration++;
      publish('closing', 'logout');
      try { if (await load()) await api.request({ path: '/v1/auth/logout', method: 'POST', decode: raw => raw }); }
      finally {
        forget('logout');
        await clearSession();
      }
    },
  };
}

let singleton: ReturnType<typeof createProductAuthClient> | undefined;
export function productAuthClient() {
  if (!singleton) {
    const url = process.env.EXPO_PUBLIC_VIMA_API_BASE_URL;
    if (!url) throw new Error('VIMA_API_BASE_URL_REQUIRED');
    singleton = createProductAuthClient(url);
  }
  return singleton;
}
