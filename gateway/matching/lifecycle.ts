import { createHash } from 'node:crypto';
import { MatchingError } from './auth.ts';
import { validatePricingConfig } from '../pricing/config.ts';
import type { PricingConfig } from '../pricing/contracts.ts';
import { priceTrip } from '../pricing/engine.ts';
import type { AuthoritativeRideQuote } from '../../src/services/pricing/contracts.ts';
import type { TripLifecycle, TripTelemetry, LifecycleCommand } from '../../src/services/matching/lifecycle.ts';
import { normalizeCoordinate } from '../../src/map/models.ts';
import { distanceMeters } from '../../src/services/geospatial/placeIdentity.ts';

export interface DurableLifecycle extends TripLifecycle { telemetry: TripTelemetry[] }
export const emptyLifecycle = (): DurableLifecycle => ({ completedStops: 0, incurredAdditionCodes: [], telemetry: [] });
export const conflict = (code: string): never => { throw new MatchingError(409, code); };
export const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
// Sort object keys, retain array order: identity includes every validated config field, not just its version.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export function quoteAdjustments(config: PricingConfig, quote: AuthoritativeRideQuote) {
  if (!config.profiles[quote.profile] || config.version !== quote.configVersion) return conflict('pricing_basis_unavailable');
  const override = quote.overrideId === undefined ? undefined : config.intermunicipalOverrides.find(o => o.id === quote.overrideId);
  if (quote.overrideId !== undefined && !override) return conflict('pricing_basis_unavailable');
  return override;
}
export function provenBasis(raw: PricingConfig | undefined, quote: AuthoritativeRideQuote): PricingConfig {
  if (!raw) return conflict('pricing_basis_unavailable');
  const config = validatePricingConfig(raw); const adjustments = quoteAdjustments(config, quote);
  const price = priceTrip({ config, profile: quote.profile, routeMetrics: quote.route, adjustments }).price;
  if (canonical(price) !== canonical(quote.price)) return conflict('pricing_basis_mismatch');
  return structuredClone(config);
}
export function effectiveAdditions(config: PricingConfig, quote: AuthoritativeRideQuote) {
  return [...config.profiles[quote.profile].additions ?? [], ...quoteAdjustments(config, quote)?.additions ?? []];
}
export function earlyPrice(config: PricingConfig, quote: AuthoritativeRideQuote, life: DurableLifecycle) {
  const filtered = structuredClone(config); const adjustments = structuredClone(quoteAdjustments(config, quote));
  filtered.profiles[quote.profile].additions = filtered.profiles[quote.profile].additions?.filter(a => life.incurredAdditionCodes.includes(a.code));
  if (adjustments) adjustments.additions = adjustments.additions?.filter(a => life.incurredAdditionCodes.includes(a.code));
  return priceTrip({ config: filtered, profile: quote.profile, adjustments, routeMetrics: life.meter! }).price;
}
export function parseTelemetry(raw: unknown): TripTelemetry {
  const v = raw as TripTelemetry;
  if (!v || Object.keys(v).some(k => !['sequence', 'coordinate', 'capturedAt', 'heading'].includes(k)) || !natural(v.sequence) || v.sequence < 1 || !natural(v.capturedAt) ||
    v.heading !== undefined && (!Number.isFinite(v.heading) || v.heading < 0 || v.heading >= 360))
    throw new MatchingError(400, 'invalid_telemetry');
  try { return { sequence: v.sequence, coordinate: normalizeCoordinate(v.coordinate), capturedAt: v.capturedAt,
    ...(v.heading !== undefined ? { heading: v.heading } : {}) }; }
  catch { throw new MatchingError(400, 'invalid_telemetry'); }
}
export function appendTelemetry(life: DurableLifecycle, sample: TripTelemetry, now: number) {
  const old = life.telemetry[sample.sequence - 1];
  if (old) { if (canonical(old) !== canonical(sample)) conflict('telemetry_conflict'); return false; }
  if (sample.sequence !== life.telemetry.length + 1) conflict('telemetry_gap');
  if (sample.capturedAt < (life.telemetry.at(-1)?.capturedAt ?? life.startedAt!) || sample.capturedAt > now) conflict('invalid_telemetry_time');
  life.telemetry.push(sample);
  // Round only the cumulative geodesic distance, never each short segment.
  const meters = life.telemetry.reduce((sum, point, i, points) => i ? sum + distanceMeters(points[i - 1]!.coordinate, point.coordinate) : 0, 0);
  const distance = Math.round(meters); const duration = Math.floor((sample.capturedAt - life.startedAt!) / 1000);
  if (!natural(distance) || !natural(duration)) conflict('meter_overflow');
  life.meter = { lastSequence: sample.sequence, distanceMeters: distance, durationSeconds: duration }; return true;
}
export function parseLifecycleCommand(raw: unknown): LifecycleCommand {
  const c = raw as LifecycleCommand;
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new MatchingError(400, 'invalid_lifecycle_command');
  const keys: Record<LifecycleCommand['name'], string[]> = { arrive: [], no_show: [], start: ['pin'],
    complete_stop: ['stopIndex'], incur_addition: ['code'], finish: ['kind', 'finalTelemetrySequence'], cash_received: [], cash_problem: [] };
  if (!Object.hasOwn(keys, c.name) || Object.keys(c).some(k => k !== 'name' && !keys[c.name].includes(k)) ||
    c.name === 'start' && (typeof c.pin !== 'string' || !/^\d{4}$/.test(c.pin)) ||
    c.name === 'complete_stop' && !natural(c.stopIndex) ||
    c.name === 'incur_addition' && (typeof c.code !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(c.code)) ||
    c.name === 'finish' && (!['normal', 'early'].includes(c.kind) || !natural(c.finalTelemetrySequence) || c.finalTelemetrySequence < 1))
    throw new MatchingError(400, 'invalid_lifecycle_command');
  return structuredClone(c);
}
