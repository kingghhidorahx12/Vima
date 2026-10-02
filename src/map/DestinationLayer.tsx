import { View } from 'react-native';
import { MapMarker } from './MapMarker';
import { normalizeCoordinate, type CircleAppearance } from './models';
import { mapColors } from './semantics';

export interface DestinationLayerProps {
  readonly id: string; readonly data: GeoJSON.FeatureCollection<GeoJSON.Point>;
  readonly kind: 'circle'; readonly appearance: CircleAppearance;
}
export function DestinationLayer({ id, data, appearance: a }: DestinationLayerProps) {
  return <>{data.features.map((feature, index) => <MapMarker key={feature.id ?? index}
    id={`${id}-${feature.id ?? index}`} coordinate={normalizeCoordinate(feature.geometry.coordinates)}>
    <View style={{ width: a.radius * 2, height: a.radius * 2, borderRadius: a.radius,
      backgroundColor: mapColors.destination, borderWidth: a.strokeWidth, borderColor: a.strokeColor }} />
  </MapMarker>)}</>;
}
