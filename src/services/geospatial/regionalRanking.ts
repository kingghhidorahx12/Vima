import type { PlaceSuggestion } from './contracts.ts';
import type { VimaLocalPlace } from './localPlaces.ts';

export const initialRegion = ['atlacomulco', 'jocotitlan', 'san-felipe-del-progreso', 'el-oro', 'acambay', 'ixtlahuaca', 'temascalcingo'] as const;
export const normalizeSearchText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function regionForText(value: string): string | undefined {
  const text = ` ${normalizeSearchText(value)} `;
  return initialRegion.find(region => text.includes(` ${region.replace(/-/g, ' ')} `));
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
  const relevance = exact ? 0 : title ? 1 : address ? 2 : 3;
  const region = place.regionId ?? regionForText(place.address);
  const tier = place.provenance === 'vima-local' && exact ? 0 : region === 'atlacomulco' ? 1 :
    initialRegion.includes(region as typeof initialRegion[number]) ? 2 : 3;
  return { relevance, tier, reason: `${['exact-name', 'title-prefixes', 'address-match', 'provider-relevance'][relevance]}:${
    ['explicit-local', 'atlacomulco', 'initial-region', 'external'][tier]}` };
}

/** Lexicographic relevance then region. No geographic exclusion, numeric weights or radius. */
export function rankRegionalPlaces<T extends PlaceSuggestion>(provider: readonly T[], local: readonly VimaLocalPlace[], query: string): readonly (T | VimaLocalPlace)[] {
  const candidates: (T | VimaLocalPlace)[] = [];
  const seen = new Set<string>();
  for (const place of provider) {
    const key = `${place.provenance ?? 'provider'}:${place.id}`;
    const addressKey = `${normalizeSearchText(place.name)}:${normalizeSearchText(place.address)}`;
    if (seen.has(key) || seen.has(addressKey)) continue;
    seen.add(key); seen.add(addressKey); candidates.push(place);
  }
  for (const place of local) {
    if (rankingReason(place, query, place.aliases).relevance === 3) continue;
    const names = [place.name, ...(place.aliases ?? [])].map(normalizeSearchText);
    const duplicate = candidates.some(other => names.includes(normalizeSearchText(other.name)) &&
      (other.regionId ?? regionForText(other.address)) === place.regionId);
    if (!duplicate) candidates.push(place);
  }
  return candidates.map((place, index) => ({ place, index,
    rank: rankingReason(place, query, 'aliases' in place ? place.aliases : []) }))
    .sort((a, b) => a.rank.relevance - b.rank.relevance || a.rank.tier - b.rank.tier || a.index - b.index)
    .map(({ place }) => place);
}
