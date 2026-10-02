/** Operational P0 debounce/transport values; separate from approved Visual/Motion timings. */
export const geospatialClientConfig = { debounceMs: 250, timeoutMs: 15_000 } as const;
export function resolveGeoMode(development: boolean, fixtures: string | undefined, baseUrl: string | undefined) {
  if (development && fixtures === '1') return 'fixture' as const;
  return baseUrl?.trim() ? 'live' as const : 'unconfigured' as const;
}
