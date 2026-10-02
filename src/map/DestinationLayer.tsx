import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { CircleAppearance } from './models';
import { mapColors } from './semantics';

export interface DestinationLayerProps {
  readonly id: string; readonly data: GeoJSON.FeatureCollection<GeoJSON.Point>;
  readonly kind: 'circle'; readonly appearance: CircleAppearance;
}
export function DestinationLayer({ id, data, appearance: a }: DestinationLayerProps) {
  return <GeoJSONSource id={`${id}-source`} data={data}>
    <Layer id={id} type="circle" paint={{ 'circle-radius': a.radius, 'circle-color': mapColors.destination,
      'circle-stroke-width': a.strokeWidth, 'circle-stroke-color': a.strokeColor }} />
  </GeoJSONSource>;
}
