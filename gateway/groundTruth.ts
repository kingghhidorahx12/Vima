import { normalizeSearchText } from '../src/services/geospatial/regionalRanking.ts';
import type { PlaceSuggestion } from '../src/services/geospatial/contracts.ts';

/** Human-reviewed names/references; no cached TomTom IDs or responses. */
export const groundTruth = [
  { query: 'Plaza Atlacomulco', journey: 'discover', expected: 'Plaza Atlacomulco', nameTokens: ['plaza', 'atlacomulco'],
    reference: 'Vial Jorge Jiménez Cantú 1288, Las Mercedes, Atlacomulco' },
  { query: 'Terminal de Autobuses Atlacomulco', journey: 'discover', expected: 'Central / Terminal de Autobuses de Atlacomulco',
    nameTokens: ['autobuses'], reference: 'Atlacomulco de Fabela, Estado de México' },
  { query: 'Centro Universitario UAEM Atlacomulco', journey: 'suggest', expected: 'Centro Universitario Atlacomulco (UAEMex)',
    nameTokens: ['universitario', 'atlacomulco'], reference: 'Carretera Toluca–Atlacomulco km 60' },
] as const;
export function groundTruthMatch(place: PlaceSuggestion, entry: typeof groundTruth[number]) {
  const name = normalizeSearchText(place.name);
  const locality = normalizeSearchText(place.address);
  return entry.nameTokens.every(token => name.includes(token)) &&
    (place.regionId === 'atlacomulco' || locality.includes('atlacomulco')) &&
    (entry.query.includes('Terminal') ? /central|terminal/.test(name) : true);
}
