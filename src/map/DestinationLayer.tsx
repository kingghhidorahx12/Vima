import { GeoJSONSource, Layer, type SymbolLayerSpecification, type CircleLayerSpecification } from '@maplibre/maplibre-react-native';
import { mapColors } from './semantics';

export interface DestinationLayerProps {
  readonly id: string;
  readonly data: GeoJSON.FeatureCollection<GeoJSON.Point>;
  readonly appearance: Pick<SymbolLayerSpecification, 'paint' | 'layout'>;
}

export interface CircleDestinationProps {
  readonly id: string;
  readonly data: GeoJSON.FeatureCollection<GeoJSON.Point>;
  readonly kind: 'circle';
  readonly appearance: Pick<CircleLayerSpecification, 'paint' | 'layout'>;
}

export function DestinationLayer(props: DestinationLayerProps | CircleDestinationProps) {
  const { id, data, appearance } = props;
  if ('kind' in props) return <GeoJSONSource id={`${id}-source`} data={data}>
    <Layer id={id} type="circle" {...props.appearance} paint={{ ...props.appearance.paint, 'circle-color': mapColors.destination }} />
  </GeoJSONSource>;
  return <GeoJSONSource id={`${id}-source`} data={data}><Layer id={id} type="symbol" {...appearance}
    paint={{ ...appearance.paint, 'icon-color': mapColors.destination }} /></GeoJSONSource>;
}
