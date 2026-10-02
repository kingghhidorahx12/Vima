import type { Coordinate } from '../../map/models.ts';
import type { ResolvedPlace } from './contracts.ts';
import { canonicalId } from './placeIdentity.ts';

export interface SavedPlace {
  readonly canonicalId: string; readonly name: string; readonly address: string;
  readonly coordinate: Coordinate; readonly regionId?: string; readonly category?: string; readonly savedAt: number;
}
export interface PersonalPlaceStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export const RECENT_PLACE_LIMIT = 16;
const keys = { favorites: 'vima.favorite-places.v1', recents: 'vima.recent-destinations.v1' } as const;
function sanitize(value: unknown): SavedPlace | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.canonicalId !== 'string' || !v.canonicalId || typeof v.name !== 'string' || !v.name.trim() ||
    typeof v.address !== 'string' || !Array.isArray(v.coordinate) || v.coordinate.length !== 2 ||
    v.coordinate.some(point => typeof point !== 'number' || !Number.isFinite(point)) ||
    Math.abs(v.coordinate[0] as number) > 180 || Math.abs(v.coordinate[1] as number) > 90 ||
    typeof v.savedAt !== 'number' || !Number.isFinite(v.savedAt) || v.savedAt < 0) return null;
  return { canonicalId: v.canonicalId, name: v.name, address: v.address,
    coordinate: [v.coordinate[0] as number, v.coordinate[1] as number], savedAt: v.savedAt,
    ...(typeof v.regionId === 'string' ? { regionId: v.regionId } : {}),
    ...(typeof v.category === 'string' ? { category: v.category } : {}) };
}
function fromPlace(place: ResolvedPlace, now: number): SavedPlace {
  const value = sanitize({ canonicalId: canonicalId(place), name: place.name, address: place.address,
    coordinate: place.coordinate, regionId: place.regionId, category: place.category, savedAt: now });
  if (!value) throw new Error('invalid_personal_place');
  return value;
}
export function createPersonalPlaces(store: PersonalPlaceStore, now = Date.now) {
  async function read(key: string, limit: number): Promise<SavedPlace[]> {
    try {
      const raw = await store.getItem(key); if (!raw) return [];
      const document = JSON.parse(raw) as { version?: unknown; places?: unknown };
      if (document.version !== 1 || !Array.isArray(document.places)) return [];
      return document.places.map(sanitize).filter((place): place is SavedPlace => !!place).slice(0, limit);
    } catch { return []; }
  }
  const write = (key: string, places: readonly SavedPlace[]) => store.setItem(key, JSON.stringify({ version: 1, places }));
  return {
    favorites: () => read(keys.favorites, 100),
    recents: () => read(keys.recents, RECENT_PLACE_LIMIT),
    async saveFavorite(place: ResolvedPlace) {
      const item = fromPlace(place, now()); const current = await read(keys.favorites, 100);
      await write(keys.favorites, [item, ...current.filter(saved => saved.canonicalId !== item.canonicalId)].slice(0, 100));
    },
    async removeFavorite(id: string) { await write(keys.favorites, (await read(keys.favorites, 100)).filter(place => place.canonicalId !== id)); },
    async recordConfirmedDestination(place: ResolvedPlace) {
      const item = fromPlace(place, now()); const current = await read(keys.recents, RECENT_PLACE_LIMIT);
      await write(keys.recents, [item, ...current.filter(saved => saved.canonicalId !== item.canonicalId)].slice(0, RECENT_PLACE_LIMIT));
    },
  };
}
export type PersonalPlacesRepository = ReturnType<typeof createPersonalPlaces>;
