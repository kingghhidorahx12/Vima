import type { ResolvedPlace, RouteResult } from '../geospatial/contracts.ts';
export interface QuoteDraft { origin: ResolvedPlace; destination: ResolvedPlace; stops: readonly ResolvedPlace[] }
export interface PriceBreakdown {
  currency: 'MXN'; baseMinor: number; distanceChargeMinor: number; durationChargeMinor: number;
  meteredSubtotalMinor: number; minimumMinor: number; minimumApplied: boolean; fareBeforeExtrasMinor: number;
  extras: readonly { code: string; kind: 'toll' | 'extra'; label: string; amountMinor: number }[];
  totalBeforeRoundingMinor: number; roundingAdjustmentMinor: number; totalMinor: number;
}
export interface RoutePreview extends QuoteDraft {
  id: string; createdAt: number; expiresAt: number; route: RouteResult;
}
export interface AuthoritativeRideQuote extends RoutePreview {
  configVersion: string; profile: 'URBANO' | 'REGIONAL'; overrideId?: string;
  distanceMeters: number; durationSeconds: number; durationSource: 'traffic' | 'static';
  price: PriceBreakdown;
}
export type QuoteResponse = { status: 'priced'; quote: AuthoritativeRideQuote } |
  { status: 'unpriced'; reason: 'pricing_not_configured' | 'pricing_unavailable'; routePreview: RoutePreview };
export interface QuoteRequest extends QuoteDraft { operationId: string }
/** Future request boundary; no request endpoint is enabled by pricing. */
export interface RideRequestReference { quoteId: string; requestId: string }
