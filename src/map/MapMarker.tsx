import { Marker } from '@maplibre/maplibre-react-native';
import type { ReactElement } from 'react';
import type { Coordinate } from './models';

/** Reuses the existing Vima child artwork and MapLibre anchor without provider-specific feature types. */
export function MapMarker({ id, coordinate, anchor = 'center', children }: {
  id: string; coordinate: Coordinate; anchor?: 'center' | 'bottom'; children: ReactElement;
}) {
  return <Marker id={id} lngLat={[...coordinate]} anchor={anchor}>{children}</Marker>;
}
