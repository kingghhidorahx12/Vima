import type { PlaceSuggestion } from './contracts.ts';
import type { VimaLocalPlace } from './localPlaces.ts';
import { samePlace } from './placeIdentity.ts';

export const initialRegion = ['atlacomulco', 'jocotitlan', 'san-felipe-del-progreso', 'el-oro', 'acambay', 'ixtlahuaca', 'temascalcingo'] as const;
const regionAliases: Readonly<Record<string, readonly string[]>> = {
  atlacomulco: ['atlacomulco', 'atlacomulco de fabela'],
  ixtlahuaca: ['ixtlahuaca', 'ixtlahuaca de rayon'],
  'el-oro': ['el oro', 'el oro de hidalgo'],
  jocotitlan: ['jocotitlan'],
  'san-felipe-del-progreso': ['san felipe del progreso'],
  acambay: ['acambay'], temascalcingo: ['temascalcingo'],
};
export const normalizeSearchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function regionForText(value: string): string | undefined {
  const text = ` ${normalizeSearchText(value)} `;
  return initialRegion.find(region => regionAliases[region]?.some(alias => text.includes(` ${alias} `)));
}
/** Small, explicit classifier: municipality name, Centro or Comunidad + municipality. */
export function isGeographicQuery(query: string): boolean {
  const normalized = normalizeSearchText(query); const region = regionForText(normalized);
  if (!region) return false;
  return regionAliases[region]?.some(alias => normalized === alias || normalized === `centro ${alias}` ||
    normalized.startsWith('comunidad ') && normalized.endsWith(` ${alias}`)) ?? false;
}
const tokens = (value: string) => normalizeSearchText(value).split(' ').filter(token => token && !['de', 'del', 'la', 'el', 'los', 'las', 'en'].includes(token));
export function rankingReason(place: PlaceSuggestion, query: string, aliases: readonly string[] = []) {
  const normalized = normalizeSearchText(query);
  const names = [place.name, ...aliases].map(normalizeSearchText);
  const queryTokens = tokens(query); const titleTokens = names.flatMap(tokens);
  const allText = tokens(place.name + ' ' + place.address);
  const exact = names.includes(normalized);
  const title = queryTokens.length > 0 && queryTokens.every(q => titleTokens.some(t => t.startsWith(q)));
  const address = queryTokens.length > 0 && queryTokens.every(q => allText.some(t => t.startsWith(q)));
  const region = place.regionId ?? regionForText(place.address);
  const geographicArea = isGeographicQuery(query) && place.category === 'area' && region === regionForText(query);
  const relevance = geographicArea || exact ? 0 : title ? 1 : address ? 2 : 3;
  const explicitRegion = regionForText(query);
  const tier = explicitRegion ? region === explicitRegion ? 0 : 3 :
    place.provenance === 'vima-local' && exact ? 0 : region === 'atlacomulco' ? 1 :
      initialRegion.includes(region as typeof initialRegion[number]) ? 2 : 3;
  const nameNoise = titleTokens.filter(token => !queryTokens.some(q => token.startsWith(q) || q.startsWith(token))).length;
  return { relevance, tier, nameNoise, reason: `${['exact-name', 'title-prefixes', 'address-match', 'provider-relevance'][relevance]}:${
    explicitRegion ? tier === 0 ? 'explicit-region' : 'external' : ['explicit-local', 'atlacomulco', 'initial-region', 'external'][tier]}` };
}

/** Lexicographic relevance then region. No geographic exclusion, numeric weights or radius. */
export function rankRegionalPlaces<T extends PlaceSuggestion>(provider: readonly T[], local: readonly VimaLocalPlace[], query: string): readonly (T | VimaLocalPlace)[] {
  const candidates: (T | VimaLocalPlace)[] = [];
  for (const place of provider) {
    if (!candidates.some(other => samePlace(other, place))) candidates.push(place);
  }
  for (const place of local) {
    if (place.status === 'pending' || place.status === 'disabled') continue;
    if (rankingReason(place, query, place.aliases).relevance === 3) continue;
    const duplicate = candidates.findIndex(other => samePlace(other, place));
    if (duplicate < 0) candidates.push(place);
    else candidates[duplicate] = place;
  }
  return candidates.map((place, index) => ({ place, index,
    rank: rankingReason(place, query, 'aliases' in place ? place.aliases : []) }))
    .sort((a, b) => a.rank.relevance - b.rank.relevance || a.rank.tier - b.rank.tier ||
      a.rank.nameNoise - b.rank.nameNoise || a.index - b.index)
    .map(({ place }) => place);
}
