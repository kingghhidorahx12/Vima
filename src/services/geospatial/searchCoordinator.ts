import type { PlaceSuggestion } from './contracts.ts';
import type { VimaLocalPlace } from './localPlaces.ts';
import { normalizeSearchText, rankRegionalPlaces, rankingReason } from './regionalRanking.ts';

/** In-memory only: personal places and reviewed local catalog appear before the network responds. */
export function createSearchCoordinator(local: readonly VimaLocalPlace[]) {
  const cache = new Map<string, { results: readonly PlaceSuggestion[]; at: number }>();
  const matches = (place: PlaceSuggestion, query: string) => rankingReason(place, query).relevance < 3;
  return {
    remember(query: string, results: readonly PlaceSuggestion[]) {
      const key = normalizeSearchText(query); if (!key) return;
      cache.delete(key); cache.set(key, { results, at: Date.now() });
      while (cache.size > 20) cache.delete(cache.keys().next().value!);
    },
    visible(query: string, favorites: readonly PlaceSuggestion[], recents: readonly PlaceSuggestion[],
      remote?: readonly PlaceSuggestion[], remoteQuery?: string): readonly PlaceSuggestion[] {
      const key = normalizeSearchText(query); if (!key) return [];
      const personal = [...favorites, ...recents].filter(place => matches(place, key));
      const entry = cache.get(key);
      const remembered = entry && Date.now() - entry.at < 15_000 ? entry.results : [];
      const compatible = remoteQuery && normalizeSearchText(remoteQuery) === key ? remote ?? [] :
        (remote ?? []).filter(place => matches(place, key));
      return rankRegionalPlaces([...personal, ...remembered, ...compatible], local, key);
    },
    clear() { cache.clear(); },
  };
}
