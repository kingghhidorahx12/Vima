import type { Coordinate } from '../../src/map/models.ts';
import type { QuoteDraft, AuthoritativeRideQuote, QuoteResponse } from '../../src/services/pricing/contracts.ts';
export type { QuoteDraft, AuthoritativeRideQuote, QuoteResponse };
export type Profile = 'URBANO' | 'REGIONAL';
export interface ConfiguredAddition { code: string; kind: 'toll' | 'extra'; label: string; amountMinor: number }
export interface RateCard {
  baseMinor: number; minimumMinor: number; distanceMinorPerKm: number; durationMinorPerMinute: number;
  additions?: readonly ConfiguredAddition[];
}
export interface CorridorOverride {
  id: string; fromRegionId: string; toRegionId: string; direction: 'both' | 'one-way';
  rateOverride?: Partial<Omit<RateCard, 'additions'>>; additions?: readonly ConfiguredAddition[];
}
export interface PricingConfig {
  version: string; currency: 'MXN'; profiles: Record<Profile, RateCard>;
  /** Server-owned polygons, no client regionId/name is trusted for pricing. */
  regions: readonly { id: string; polygon: readonly Coordinate[] }[];
  intermunicipalOverrides: readonly CorridorOverride[];
  quoteTtlSeconds: number; rounding: { incrementMinor: number; mode: 'half_up' };
}
export class PricingError extends Error {
  readonly code: 'pricing_unavailable' | 'idempotency_conflict' | 'quote_expired' | 'quote_capacity';
  constructor(code: PricingError['code']) { super(code); this.code = code; }
}
