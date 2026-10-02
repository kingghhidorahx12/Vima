export interface ApiRequest<T> {
  readonly path: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly decode: (value: unknown) => T;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
}

export interface ApiClient {
  request<T>(request: ApiRequest<T>): Promise<T>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, code?: string) { super(`API request failed (${status})`); this.status = status; this.code = code; }
}

/** No backend URL, endpoints or success fixtures are invented by the bootstrap. */
export function createApiClient(baseUrl: string, readCredential: () => Promise<string | null>, options: { development?: boolean } = {}): ApiClient {
  const base = new URL(baseUrl);
  const host = base.hostname;
  const octets = host.split('.').map(Number);
  const ipv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host) && octets.every(value => value >= 0 && value <= 255);
  const privateHost = host === 'localhost' || host === '[::1]' || (ipv4 && (octets[0] === 127 || octets[0] === 10 ||
    (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)));
  const localHttp = options.development === true && base.protocol === 'http:' && privateHost;
  if (base.protocol !== 'https:' && !localHttp) throw new Error('API requires HTTPS');
  if (base.username || base.password || base.search || base.hash) throw new Error('Invalid API base URL');
  return {
    async request<T>({ path, method, body, signal, decode, idempotencyKey }: ApiRequest<T>): Promise<T> {
      const url = new URL(path, base);
      if (url.origin !== base.origin) throw new Error('API requests must stay on the configured origin');
      const credential = await readCredential();
      if (localHttp && credential) throw new Error('Credentials require HTTPS');
      if (idempotencyKey && !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) throw new Error('Invalid idempotency key');
      const response = await fetch(url.toString(), {
        method, signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        let code: string | undefined;
        try {
          const error = await response.json() as { error?: { code?: unknown } };
          if (typeof error.error?.code === 'string' && /^[a-z_]{1,40}$/.test(error.error.code)) code = error.error.code;
        } catch { /* Never retain raw upstream bodies. */ }
        throw new ApiError(response.status, code);
      }
      // Even a 2xx must pass the backend-specific decoder before being usable.
      return decode(await response.json());
    },
  };
}
