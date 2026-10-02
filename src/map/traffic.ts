export type TrafficLayerPreferences = { readonly traffic: boolean; readonly incidents: boolean };
export const defaultTrafficLayers: TrafficLayerPreferences = { traffic: false, incidents: false };

export function parseTrafficLayers(value: unknown): TrafficLayerPreferences {
  if (!value || typeof value !== 'object') return defaultTrafficLayers;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.traffic === 'boolean' && typeof candidate.incidents === 'boolean'
    ? { traffic: candidate.traffic, incidents: candidate.incidents } : defaultTrafficLayers;
}

export function displayKeyAvailable(value: string | undefined): boolean { return !!value?.trim(); }

/** TomTom Orbis Traffic API v2. The key is sent as a scoped native request header. */
export const trafficTileUrls = {
  flow: 'https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/{z}/{x}/{y}?apiVersion=2',
  incidents: 'https://api.tomtom.com/maps/orbis/traffic/incidents/vector/tile/{z}/{x}/{y}?apiVersion=2',
} as const;
