import type { MapProps } from '@maplibre/maplibre-react-native';
import positron from './styles/positron.json' with { type: 'json' };
import { developmentDemoStyle } from './style.ts';

/** Approved Passenger palette, applied only to the bundled Positron style. */
const paintById: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  background: { 'background-color': '#F7F8F7' },
  landuse_residential: { 'fill-color': '#F7F8F7' },
  building: { 'fill-color': '#F7F8F7', 'fill-outline-color': '#EBEBEB' },
  park: { 'fill-color': '#CFE9D3' },
  water: { 'fill-color': '#AFD6FA' },
  waterway: { 'line-color': '#AFD6FA' },
  road_area_pier: { 'fill-color': '#F7F8F7' },
  road_pier: { 'line-color': '#F7F8F7' },
  highway_path: { 'line-color': '#F5F6F7' },
  highway_minor: { 'line-color': '#F0F2F0' },
  highway_major_casing: { 'line-color': '#DDE2DE' },
  highway_major_inner: { 'line-color': '#F1F2F1' },
  highway_major_subtle: { 'line-color': '#EBEBEB' },
  highway_motorway_casing: { 'line-color': '#EBEBEB' },
  highway_motorway_inner: { 'line-color': '#EBEBEB' },
  highway_motorway_subtle: { 'line-color': '#EBEBEB' },
  highway_motorway_bridge_casing: { 'line-color': '#EBEBEB' },
  highway_motorway_bridge_inner: { 'line-color': '#EBEBEB' },
  tunnel_motorway_casing: { 'line-color': '#EBEBEB' },
  tunnel_motorway_inner: { 'line-color': '#EBEBEB' },
};

// OpenMapTiles landcover has class/subclass; landuse has class. Keep the distant
// appearance and add detail only as the actual vector tiles reveal it.
const zoomStrength = (factor = 1) => [
  'interpolate', ['linear'], ['zoom'],
  12, 0, 13, 0.45 * factor, 14, 0.8 * factor,
  15, 0.95 * factor, 16, factor,
] as const;

const woodColor = [
  'interpolate', ['linear'], ['zoom'],
  12, '#ECF6EF', 13, '#E3F2E6', 14, '#DBEFE0',
  15, '#CFE9D3', 16, '#CFE9D3',
] as const;

const polygonFilter = ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false] as const;
const landcover = (id: string, className: string, color: unknown, factor = 1) => ({
  id, type: 'fill' as const, source: 'openmaptiles', 'source-layer': 'landcover',
  minzoom: 12,
  filter: ['all', polygonFilter, ['==', ['get', 'class'], className]],
  paint: { 'fill-color': color, 'fill-opacity': zoomStrength(factor) },
});

const closeLandcover = [
  landcover('landcover_grass', 'grass', [
    'step', ['zoom'], '#ECF6EF', 14,
    ['match', ['get', 'subclass'],
      ['garden', 'park', 'recreation_ground', 'golf_course'], '#CFE9D3', '#ECF6EF'],
  ]),
  landcover('landcover_farmland', 'farmland', '#ECF6EF', 0.55),
  landcover('landcover_wetland', 'wetland', '#D8EEDB', 0.75),
  {
    id: 'landuse_recreation', type: 'fill' as const, source: 'openmaptiles',
    'source-layer': 'landuse', minzoom: 15,
    filter: ['all', polygonFilter,
      ['match', ['get', 'class'],
        ['pitch', 'playground', 'stadium', 'theme_park', 'zoo', 'cemetery'], true, false]],
    paint: {
      'fill-color': '#CFE9D3',
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 16, 0.65],
    },
  },
];

const layers = positron.layers.flatMap((layer): Record<string, unknown>[] => {
  // Below water, roads and labels; no source/filter or ordering change to those layers.
  if (layer.id === 'water') return [
    ...closeLandcover,
    { ...layer, paint: { ...layer.paint, ...paintById.water } },
  ];
  if (layer.id === 'landcover_wood') return [{
    ...layer, paint: { ...layer.paint, 'fill-color': woodColor },
  }];
  return [paintById[layer.id]
    ? { ...layer, paint: { ...layer.paint, ...paintById[layer.id] } } : layer];
});

export const passengerBasemap = {
  ...positron,
  sources: { ...positron.sources, openmaptiles: { ...positron.sources.openmaptiles,
    attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> · <a href="https://openmaptiles.org">© OpenMapTiles</a> · ' +
      '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · ' +
      '<a href="https://github.com/openmaptiles/positron-gl-style">Positron / CartoDB (Stamen, Paul Norman), colores adaptados por Vima</a>',
  } },
  layers,
} as unknown as Exclude<MapProps['mapStyle'], string>;

/** Explicit custom styles remain authoritative; never guess another provider's schema. */
export function resolveBasemapStyle(url: string): MapProps['mapStyle'] {
  return url === developmentDemoStyle ? passengerBasemap : url;
}
