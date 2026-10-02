import type { VimaLocalPlace } from '../src/services/geospatial/localPlaces.ts';

/** Independently verified public catalog, not imported from DEV fixtures.
 * Coordinates: © OpenStreetMap contributors, ODbL; see docs/ATLACOMULCO_GROUND_TRUTH.md.
 * Area representative points, not surveyed pickup entrances. No provider response is persisted.
 */
export const localPlaces: readonly VimaLocalPlace[] = [
  { id: 'vima-local:plaza-atlacomulco', name: 'Plaza Atlacomulco',
    address: 'Circuito Vial Jorge Jiménez Cantú 1288, Las Mercedes, Atlacomulco',
    coordinate: [-99.88795, 19.79021], provenance: 'vima-local', regionId: 'atlacomulco', category: 'mall' },
  { id: 'vima-local:cu-uaem-atlacomulco', name: 'Centro Universitario UAEM Atlacomulco',
    aliases: ['Centro Universitario Atlacomulco', 'UAEM Atlacomulco'],
    address: 'Carretera Toluca–Atlacomulco km 60, Atlacomulco',
    coordinate: [-99.84073, 19.76183], provenance: 'vima-local', regionId: 'atlacomulco', category: 'university' },
];
