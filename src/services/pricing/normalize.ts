import { GeospatialError } from '../geospatial/contracts.ts';
import { decodePlace, decodeRoute } from '../geospatial/normalize.ts';
import type { QuoteResponse, PriceBreakdown } from './contracts.ts';
const fail = (): never => { throw new GeospatialError('invalid_result'); };
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(); return v as Record<string, unknown>; }
function integer(v: unknown, signed = false): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || !signed && v < 0) fail(); return v as number; }
function text(v: unknown): string { if (typeof v !== 'string' || !v.trim() || v.length > 256) fail(); return v as string; }
export function decodeQuoteResponse(value: unknown): QuoteResponse {
  const response = object(value);
  if (response.status !== 'priced' && response.status !== 'unpriced') fail();
  const q = object(response.status === 'priced' ? response.quote : response.routePreview);
  if (!Array.isArray(q.stops) || q.stops.length > 10) fail();
  const preview = { id: text(q.id), createdAt: integer(q.createdAt), expiresAt: integer(q.expiresAt),
    origin: decodePlace(q.origin), destination: decodePlace(q.destination), stops: (q.stops as unknown[]).map(decodePlace), route: decodeRoute(q.route) };
  if (preview.expiresAt <= preview.createdAt) fail();
  if (response.status === 'unpriced') {
    if (response.reason !== 'pricing_not_configured' && response.reason !== 'pricing_unavailable') fail();
    return { status: 'unpriced', reason: response.reason as 'pricing_not_configured' | 'pricing_unavailable', routePreview: preview };
  }
  const price = decodePriceBreakdown(q.price);
  if (q.profile !== 'URBANO' && q.profile !== 'REGIONAL' || q.durationSource !== 'traffic' && q.durationSource !== 'static') fail();
  if (q.distanceMeters !== preview.route.distanceMeters || q.durationSeconds !==
    (q.durationSource === 'traffic' ? preview.route.trafficDurationSeconds : preview.route.durationSeconds)) fail();
  return { status: 'priced', quote: { ...preview, configVersion: text(q.configVersion), profile: q.profile as 'URBANO' | 'REGIONAL',
    ...(q.overrideId === undefined ? {} : { overrideId: text(q.overrideId) }), distanceMeters: integer(q.distanceMeters),
    durationSeconds: integer(q.durationSeconds), durationSource: q.durationSource as 'traffic' | 'static', price } };
}

export function decodePriceBreakdown(value: unknown): PriceBreakdown {
  const p = object(value);
  if (p.currency !== 'MXN' || typeof p.minimumApplied !== 'boolean' || !Array.isArray(p.extras) || p.extras.length > 100) fail();
  const price: PriceBreakdown = { currency: 'MXN', minimumApplied: p.minimumApplied as boolean,
    baseMinor: integer(p.baseMinor), distanceChargeMinor: integer(p.distanceChargeMinor), durationChargeMinor: integer(p.durationChargeMinor),
    meteredSubtotalMinor: integer(p.meteredSubtotalMinor), minimumMinor: integer(p.minimumMinor), fareBeforeExtrasMinor: integer(p.fareBeforeExtrasMinor),
    totalBeforeRoundingMinor: integer(p.totalBeforeRoundingMinor), roundingAdjustmentMinor: integer(p.roundingAdjustmentMinor, true), totalMinor: integer(p.totalMinor),
    extras: (p.extras as unknown[]).map(v => { const e = object(v); if (e.kind !== 'toll' && e.kind !== 'extra') fail();
      return { code: text(e.code), label: text(e.label), kind: e.kind as 'toll' | 'extra', amountMinor: integer(e.amountMinor) }; }) };
  if (price.baseMinor + price.distanceChargeMinor + price.durationChargeMinor !== price.meteredSubtotalMinor ||
    price.fareBeforeExtrasMinor !== Math.max(price.minimumMinor, price.meteredSubtotalMinor) ||
    price.fareBeforeExtrasMinor + price.extras.reduce((sum, a) => sum + a.amountMinor, 0) !== price.totalBeforeRoundingMinor ||
    price.totalBeforeRoundingMinor + price.roundingAdjustmentMinor !== price.totalMinor) fail();
  return price;
}
