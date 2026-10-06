import type { PlaceSuggestion } from '../../services/geospatial/contracts.ts';

/** Commit-time registry: rendered search identities never re-enter on provider updates. */
export class SearchEntranceRegistry {
  private field: 'origin' | 'destination' | null = null;
  private readonly seen = new Set<string>();

  has(field: 'origin' | 'destination', place: PlaceSuggestion): boolean {
    return this.field === field && (this.seen.has(place.id) ||
      !!place.canonicalId && this.seen.has(place.canonicalId));
  }

  mark(field: 'origin' | 'destination' | null, places: readonly PlaceSuggestion[]): void {
    if (this.field !== field) { this.field = field; this.seen.clear(); }
    for (const place of places) {
      this.seen.add(place.id);
      if (place.canonicalId) this.seen.add(place.canonicalId);
    }
  }
}
