import type { Bounds, Coordinate } from '../../map/models.ts';
import type { RouteFeature } from '../../map/routeGeometry.ts';

export interface PlaceSuggestion {
  readonly id: string; readonly name: string; readonly address: string;
  readonly provenance?: 'provider' | 'vima-local'; readonly category?: string;
  readonly regionId?: string;
}
export interface ResolvedPlace extends PlaceSuggestion { readonly coordinate: Coordinate }
export interface RouteResult {
  readonly geometry: RouteFeature;
  readonly bounds: Bounds;
  readonly distanceMeters: number;
  /** Travel time without traffic; seconds. */
  readonly durationSeconds: number;
  readonly trafficDurationSeconds?: number;
}
export interface RouteRequest {
  readonly origin: Coordinate; readonly destination: Coordinate; readonly stops: readonly Coordinate[];
}
export type GeospatialErrorCode = 'map_unavailable' | 'search_unavailable' | 'route_unavailable' |
  'geocoding_unavailable' | 'no_result' | 'timeout' | 'invalid_result' | 'network_recoverable' | 'cancelled';
export class GeospatialError extends Error {
  readonly code: GeospatialErrorCode;
  constructor(code: GeospatialErrorCode) { super(code); this.name = 'GeospatialError'; this.code = code; }
}
export interface PlacesSession {
  autocomplete(input: string, signal?: AbortSignal, bias?: Coordinate): Promise<readonly PlaceSuggestion[]>;
  search(input: string, signal?: AbortSignal, bias?: Coordinate): Promise<readonly PlaceSuggestion[]>;
  resolve(id: string, signal?: AbortSignal): Promise<ResolvedPlace>;
  close(signal?: AbortSignal): Promise<void>;
}
