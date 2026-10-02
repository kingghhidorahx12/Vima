import type { Coordinate } from '../../map/models.ts';
import type { ResolvedPlace } from './contracts.ts';

/** Only validated, approved production places may be supplied here. DEV fixtures are separate. */
export interface VimaLocalPlace extends ResolvedPlace {
  readonly provenance: 'vima-local';
  readonly regionId: string;
  readonly canonicalName: string;
  readonly aliases?: readonly string[];
  /** Opaque, stable provider reference keys; raw provider payloads are never retained. */
  readonly providerRefs?: readonly string[];
  readonly status: 'verified' | 'pending' | 'disabled';
  readonly verifiedAt?: string;
  readonly locality?: string;
}

export interface RegionalRankingPolicy {
  readonly origin: Coordinate;
  readonly initialRegionId: string;
  readonly nearbyRegionIds: readonly string[];
  /** Required calibration from an approved policy; there are no production defaults. */
  readonly distanceWeight: number;
  readonly initialRegionBoost: number;
  readonly nearbyRegionBoost: number;
}

/** Human-reviewed public catalog. Coordinates © OpenStreetMap contributors, ODbL; see ground-truth documentation. */
export const approvedLocalPlaces: readonly VimaLocalPlace[] = [
  { id: 'vima-local:plaza-atlacomulco', canonicalName: 'Plaza Atlacomulco', name: 'Plaza Atlacomulco',
    address: 'Circuito Vial Jorge Jiménez Cantú 1288, Las Mercedes, Atlacomulco',
    coordinate: [-99.88795, 19.79021], provenance: 'vima-local', regionId: 'atlacomulco', category: 'mall', status: 'verified' },
  { id: 'vima-local:cu-uaem-atlacomulco', canonicalName: 'Centro Universitario UAEM Atlacomulco',
    name: 'Centro Universitario UAEM Atlacomulco', aliases: ['Centro Universitario Atlacomulco', 'UAEM Atlacomulco'],
    address: 'Carretera Toluca–Atlacomulco km 60, Atlacomulco',
    coordinate: [-99.84073, 19.76183], provenance: 'vima-local', regionId: 'atlacomulco', category: 'university', status: 'verified' },
];

/** Merge without filtering distant/intermunicipal results or inventing local POIs. */
export function mergePlaces(provider: readonly ResolvedPlace[], local: readonly VimaLocalPlace[],
  rank?: RegionalRankingPolicy): readonly ResolvedPlace[] {
  const unique = new Map<string, ResolvedPlace>();
  for (const place of [...provider, ...local]) {
    const key = `${place.provenance ?? 'provider'}:${place.id}`;
    if (!unique.has(key)) unique.set(key, place);
  }
  const places = [...unique.values()];
  if (!rank) return places;
  const weights = [rank.distanceWeight, rank.initialRegionBoost, rank.nearbyRegionBoost];
  if (weights.some(value => !Number.isFinite(value) || value < 0)) throw new Error('invalid_regional_ranking_policy');
  const [lng, lat] = rank.origin;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90)
    throw new Error('invalid_regional_ranking_policy');
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const distance = (coordinate: Coordinate) => {
    const latDelta = radians(coordinate[1] - lat);
    const lngDelta = radians(coordinate[0] - lng);
    const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(lat)) * Math.cos(radians(coordinate[1])) * Math.sin(lngDelta / 2) ** 2;
    return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const score = (place: ResolvedPlace) => -rank.distanceWeight * distance(place.coordinate)
    + (place.regionId === rank.initialRegionId ? rank.initialRegionBoost :
      place.regionId && rank.nearbyRegionIds.includes(place.regionId) ? rank.nearbyRegionBoost : 0);
  return places.map((place, index) => ({ place, index })).sort((a, b) => score(b.place) - score(a.place) || a.index - b.index)
    .map(({ place }) => place);
}
