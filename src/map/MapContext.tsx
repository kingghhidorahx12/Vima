import { createContext, useContext, type RefObject } from 'react';
import type MapView from 'react-native-maps';
import type { MapPadding } from './models';

// Temporary seam; provider-native handles never leave src/map.
export const MapContext = createContext<{
  provider: 'google' | 'maplibre'; map: RefObject<MapView | null>; ready: boolean;
  padding: MapPadding; setPadding: (padding: MapPadding) => void;
} | null>(null);
export function useMapContext() {
  const context = useContext(MapContext);
  if (!context) throw new Error('Map content requires VimaMap');
  return context;
}
