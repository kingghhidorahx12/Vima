import type { Coordinate } from '../../src/map/models.ts';
import { PricingError, type PricingConfig, type Profile } from './contracts.ts';

function contains(p: Coordinate, ring: readonly Coordinate[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!; const b = ring[i]!;
    const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-12 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
      p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function selectPricing(config: PricingConfig, points: readonly Coordinate[]) {
  if (points.length < 2) throw new PricingError('pricing_unavailable');
  const regions = points.map(point => {
    const matches = config.regions.filter(r => contains(point, r.polygon));
    if (matches.length !== 1) throw new PricingError('pricing_unavailable');
    return matches[0]!.id;
  });
  const profile: Profile = new Set(regions).size === 1 ? 'URBANO' : 'REGIONAL';
  const from = regions[0]!; const to = regions.at(-1)!;
  const matches = profile === 'REGIONAL' && regions.every(r => r === from || r === to)
    ? config.intermunicipalOverrides.filter(o => o.fromRegionId === from && o.toRegionId === to ||
      o.direction === 'both' && o.fromRegionId === to && o.toRegionId === from) : [];
  if (matches.length > 1) throw new PricingError('pricing_unavailable');
  return { profile, override: matches[0] };
}
