import { Marker as LegacyMarker } from '@maplibre/maplibre-react-native';
import { useRef, useState, type ReactElement, type ComponentRef } from 'react';
import { Marker } from 'react-native-maps';
import { useMapContext } from './MapContext';
import { googleCoordinate } from './google/camera';
import type { Coordinate } from './models';

/** Keeps the same child artwork and anchors on both native engines. */
export function MapMarker({ id, coordinate, anchor = 'center', children }: {
  id: string; coordinate: Coordinate; anchor?: 'center' | 'bottom'; children: ReactElement;
}) {
  const { provider } = useMapContext();
  const ref = useRef<ComponentRef<typeof Marker>>(null);
  const [laidOut, setLaidOut] = useState(false);
  return provider === 'google'
    ? <Marker ref={ref} identifier={id} coordinate={googleCoordinate(coordinate)}
      anchor={{ x: 0.5, y: anchor === 'bottom' ? 1 : 0.5 }} tracksViewChanges={!laidOut}
      onLayout={() => { ref.current?.redraw(); setLaidOut(true); }}>{children}</Marker>
    : <LegacyMarker id={id} lngLat={[...coordinate]} anchor={anchor}>{children}</LegacyMarker>;
}
