import { normalizeCoordinate, type Coordinate } from '../src/map/models.ts';
import { GeospatialError } from '../src/services/geospatial/contracts.ts';
import type { GatewayConfig } from './config.ts';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GeospatialError('invalid_result');
  return value as Record<string, unknown>;
}
export function allowFields(value: unknown, fields: readonly string[]) {
  const data = record(value);
  if (Object.keys(data).some(key => !fields.includes(key))) throw new GeospatialError('invalid_result');
  return data;
}
export function query(value: unknown, config: Pick<GatewayConfig, 'maxQueryLength'>): string {
  if (typeof value !== 'string' || !value.trim() || value.length > config.maxQueryLength || /[\u0000-\u001f]/.test(value))
    throw new GeospatialError('invalid_result');
  return value.trim();
}
export function coordinate(value: unknown): Coordinate {
  try { return normalizeCoordinate(value); } catch { throw new GeospatialError('invalid_result'); }
}
export function optionalBias(value: unknown): Coordinate | undefined { return value === undefined ? undefined : coordinate(value); }
export function routeRequest(value: unknown, config: Pick<GatewayConfig, 'maxStops'>) {
  const data = allowFields(value, ['origin', 'destination', 'stops']);
  if (!Array.isArray(data.stops) || data.stops.length > config.maxStops) throw new GeospatialError('invalid_result');
  return { origin: coordinate(data.origin), destination: coordinate(data.destination), stops: data.stops.map(coordinate) };
}
