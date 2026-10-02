import type { Coordinate } from '../../map/models.ts';
import type { PlaceSuggestion } from './contracts.ts';

export const normalizePlaceName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

interface Candidate extends PlaceSuggestion {
  readonly coordinate?: Coordinate; readonly providerRef?: string;
  readonly providerRefs?: readonly string[]; readonly aliases?: readonly string[];
}
const distanceMeters = (a: Coordinate, b: Coordinate) => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b[1] - a[1]); const dLng = radians(b[0] - a[0]);
  const area = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
};

/** Explicit reference wins; a declared alias needs a spatial check. Never collapse branches by similar names. */
export function samePlace(a: Candidate, b: Candidate): boolean {
  if (a.canonicalId && b.canonicalId && a.canonicalId === b.canonicalId) return true;
  if (a.providerRef && b.providerRefs?.includes(a.providerRef)) return true;
  if (b.providerRef && a.providerRefs?.includes(b.providerRef)) return true;
  if (a.id === b.id && a.provenance === b.provenance) return true;
  if (!a.coordinate || !b.coordinate) return false;
  const aName = normalizePlaceName(a.name); const bName = normalizePlaceName(b.name);
  const aliasesA = a.aliases ?? [];
  const aliasesB = b.aliases ?? [];
  const declaredAlias = aliasesA.some(alias => normalizePlaceName(alias) === bName) ||
    aliasesB.some(alias => normalizePlaceName(alias) === aName);
  return declaredAlias && distanceMeters(a.coordinate, b.coordinate) <= 150;
}

export function canonicalId(place: PlaceSuggestion): string { return place.canonicalId ?? place.id; }
