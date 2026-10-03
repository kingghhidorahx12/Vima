import { validatePricingConfig } from '../../gateway/pricing/config.ts';
/** SYNTHETIC_PRICING_TEST_ONLY: arbitrary arithmetic units and imaginary regions, never live rates. */
export function syntheticPricing() {
  return validatePricingConfig({ version: 'SYNTHETIC_PRICING_TEST_ONLY', currency: 'MXN',
    profiles: { URBANO: { baseMinor: 101, minimumMinor: 509, distanceMinorPerKm: 37, durationMinorPerMinute: 13 },
      REGIONAL: { baseMinor: 211, minimumMinor: 719, distanceMinorPerKm: 53, durationMinorPerMinute: 17 } },
    regions: [0, 2, 4].map((x, i) => ({ id: `region-${i}`, polygon: [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]] })),
    intermunicipalOverrides: [] });
}
export const syntheticDraft = {
  origin: { id: 'a', name: 'A', address: '', coordinate: [0.2, 0.2] as const },
  destination: { id: 'b', name: 'B', address: '', coordinate: [0.8, 0.8] as const }, stops: [],
};
export const syntheticRoute = {
  geometry: { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[0.2, 0.2], [0.8, 0.8]] } },
  bounds: { southwest: [0.2, 0.2] as const, northeast: [0.8, 0.8] as const },
  distanceMeters: 10000, durationSeconds: 600, trafficDurationSeconds: 900,
};
