/** Operational DEV defaults only. They are not production product policy. */
export const devGatewayDefaults = {
  host: '127.0.0.1', port: 8787, sessionTtlMs: 300_000, cleanupMs: 30_000,
  upstreamTimeoutMs: 10_000, rateWindowMs: 60_000, rateLimit: 60,
  maxBodyBytes: 16_384, maxQueryLength: 256, maxStops: 10, maxSessions: 500,
  maxRateClients: 1000, maxResults: 10, maxUpstreamBytes: 4_000_000,
} as const;
export interface GatewayConfig {
  host: string; port: number; sessionTtlMs: number; cleanupMs: number;
  upstreamTimeoutMs: number; rateWindowMs: number; rateLimit: number;
  maxBodyBytes: number; maxQueryLength: number; maxStops: number; maxSessions: number;
  maxRateClients: number; maxResults: number; maxUpstreamBytes: number; logging: boolean;
  serviceAreaBounds?: readonly [west: number, south: number, east: number, north: number];
  runtimeDir?: string;
}
export function gatewayConfig(env: Readonly<Record<string, string | undefined>> = process.env): GatewayConfig {
  const result: GatewayConfig = { ...devGatewayDefaults, logging: env.VIMA_GEO_LOGGING !== '0' };
  const names = { port: 'PORT', sessionTtlMs: 'SESSION_TTL_MS', cleanupMs: 'CLEANUP_MS',
    upstreamTimeoutMs: 'UPSTREAM_TIMEOUT_MS', rateWindowMs: 'RATE_WINDOW_MS', rateLimit: 'RATE_LIMIT' } as const;
  for (const [field, suffix] of Object.entries(names)) {
    const value = env[`VIMA_GEO_${suffix}`];
    if (value !== undefined) {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number <= 0 || (field === 'port' && number > 65535)) throw new Error('invalid_gateway_config');
      result[field as keyof typeof names] = number;
    }
  }
  result.host = env.VIMA_GEO_HOST?.trim() || result.host;
  if (env.VIMA_GEO_SERVICE_AREA_BOUNDS?.trim()) {
    const bounds = env.VIMA_GEO_SERVICE_AREA_BOUNDS.split(',').map(Number);
    if (bounds.length !== 4 || bounds.some(value => !Number.isFinite(value)) ||
      bounds[0]! < -180 || bounds[2]! > 180 || bounds[1]! < -90 || bounds[3]! > 90 ||
      bounds[0]! >= bounds[2]! || bounds[1]! >= bounds[3]!) throw new Error('invalid_gateway_config');
    result.serviceAreaBounds = bounds as [number, number, number, number];
  }
  result.runtimeDir = env.VIMA_GEO_RUNTIME_DIR?.trim() || '.runtime';
  return result;
}
