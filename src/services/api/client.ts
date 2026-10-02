export interface ApiRequest<T> {
  readonly path: string;
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly decode: (value: unknown) => T;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(request: ApiRequest<T>): Promise<T>;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number) { super(`API request failed (${status})`); this.status = status; }
}

/** No backend URL, endpoints or success fixtures are invented by the bootstrap. */
export function createApiClient(baseUrl: string, readCredential: () => Promise<string | null>): ApiClient {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:') throw new Error('API requires HTTPS');
  return {
    async request<T>({ path, method, body, signal, decode }: ApiRequest<T>): Promise<T> {
      const url = new URL(path, base);
      if (url.origin !== base.origin) throw new Error('API requests must stay on the configured origin');
      const credential = await readCredential();
      const response = await fetch(url.toString(), {
        method, signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new ApiError(response.status);
      // Even a 2xx must pass the backend-specific decoder before being usable.
      return decode(await response.json());
    },
  };
}
