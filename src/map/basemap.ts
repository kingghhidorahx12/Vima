import type { MapProps } from '@maplibre/maplibre-react-native';
import positron from './styles/positron.json' with { type: 'json' };
import { developmentDemoStyle } from './style.ts';

/** Approved Passenger palette, applied to the existing Positron style's paint only. */
const paintById: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  background: { 'background-color': '#F7F8F7' },
  landuse_residential: { 'fill-color': '#F7F8F7' },
  building: { 'fill-color': '#F7F8F7', 'fill-outline-color': '#EBEBEB' },
  park: { 'fill-color': '#D8EEDB' },
  landcover_wood: { 'fill-color': '#ECF6EF' },
  water: { 'fill-color': '#BFDDF9' },
  waterway: { 'line-color': '#BFDDF9' },
  road_area_pier: { 'fill-color': '#F7F8F7' },
  road_pier: { 'line-color': '#F7F8F7' },
  highway_path: { 'line-color': '#F5F6F7' },
  highway_minor: { 'line-color': '#F5F6F7' },
  highway_major_casing: { 'line-color': '#EBEBEB' },
  highway_major_inner: { 'line-color': '#EBEBEB' },
  highway_major_subtle: { 'line-color': '#EBEBEB' },
  highway_motorway_casing: { 'line-color': '#EBEBEB' },
  highway_motorway_inner: { 'line-color': '#EBEBEB' },
  highway_motorway_subtle: { 'line-color': '#EBEBEB' },
  highway_motorway_bridge_casing: { 'line-color': '#EBEBEB' },
  highway_motorway_bridge_inner: { 'line-color': '#EBEBEB' },
  tunnel_motorway_casing: { 'line-color': '#EBEBEB' },
  tunnel_motorway_inner: { 'line-color': '#EBEBEB' },
};

export const passengerBasemap = {
  ...positron,
  sources: { ...positron.sources, openmaptiles: { ...positron.sources.openmaptiles,
    attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> · <a href="https://openmaptiles.org">© OpenMapTiles</a> · ' +
      '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · ' +
      '<a href="https://github.com/openmaptiles/positron-gl-style">Positron / CartoDB (Stamen, Paul Norman), colores adaptados por Vima</a>',
  } },
  layers: positron.layers.map(layer => paintById[layer.id]
    ? { ...layer, paint: { ...layer.paint, ...paintById[layer.id] } } : layer),
} as Exclude<MapProps['mapStyle'], string>;

/** Explicit custom styles remain authoritative; never guess another provider's schema. */
export function resolveBasemapStyle(url: string): MapProps['mapStyle'] {
  return url === developmentDemoStyle ? passengerBasemap : url;
}
