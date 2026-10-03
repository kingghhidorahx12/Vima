import { PricingError, type PricingConfig, type Profile, type CorridorOverride } from './contracts.ts';
import type { PriceBreakdown } from '../../src/services/pricing/contracts.ts';

function natural(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new PricingError('pricing_unavailable'); return BigInt(value); }
function safe(value: bigint) { if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new PricingError('pricing_unavailable'); return Number(value); }
/** Exact rational arithmetic (LCM of 1000 metres and 60 seconds), a single final half-up rounding. */
export function priceTrip({ config, profile, routeMetrics, adjustments }: {
  config: PricingConfig; profile: Profile;
  routeMetrics: { distanceMeters: number; durationSeconds: number; trafficDurationSeconds?: number };
  adjustments?: Pick<CorridorOverride, 'rateOverride' | 'additions'>;
}): { price: PriceBreakdown; durationSeconds: number; durationSource: 'traffic' | 'static' } {
  if (config.currency !== 'MXN' || config.rounding.mode !== 'half_up' || !config.profiles[profile]) throw new PricingError('pricing_unavailable');
  const rate = { ...config.profiles[profile], ...adjustments?.rateOverride };
  const durationSeconds = routeMetrics.trafficDurationSeconds ?? routeMetrics.durationSeconds;
  natural(routeMetrics.durationSeconds);
  const d = natural(routeMetrics.distanceMeters) * natural(rate.distanceMinorPerKm) * 3n;
  const time = natural(durationSeconds) * natural(rate.durationMinorPerMinute) * 50n;
  const base = natural(rate.baseMinor); const minimum = natural(rate.minimumMinor);
  const metered = base * 3000n + d + time;
  const fare = metered < minimum * 3000n ? minimum * 3000n : metered;
  const extras = [...rate.additions ?? [], ...adjustments?.additions ?? []];
  if (new Set(extras.map(a => a.code)).size !== extras.length) throw new PricingError('pricing_unavailable');
  const total = fare + extras.reduce((sum, a) => sum + natural(a.amountMinor), 0n) * 3000n;
  const increment = natural(config.rounding.incrementMinor);
  if (!increment) throw new PricingError('pricing_unavailable');
  const rounded = ((total * 2n + increment * 3000n) / (increment * 6000n)) * increment;
  safe(metered / 3000n); safe(total / 3000n); safe(rounded);
  const distanceChargeMinor = safe(d / 3000n);
  // Ledger fields use integer allocation; fractional cents remain in total until final rounding.
  const subtotal = safe(metered / 3000n);
  return { durationSeconds, durationSource: routeMetrics.trafficDurationSeconds === undefined ? 'static' : 'traffic', price: {
    currency: 'MXN', baseMinor: rate.baseMinor, distanceChargeMinor,
    durationChargeMinor: subtotal - rate.baseMinor - distanceChargeMinor, meteredSubtotalMinor: subtotal,
    minimumMinor: rate.minimumMinor, minimumApplied: fare > metered, fareBeforeExtrasMinor: safe(fare / 3000n),
    extras: extras.map(a => ({ ...a })), totalBeforeRoundingMinor: safe(total / 3000n),
    roundingAdjustmentMinor: Number(rounded - total / 3000n), totalMinor: safe(rounded),
  } };
}
