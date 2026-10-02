import { GeoJSONSource, Layer, type SymbolLayerSpecification, type CircleLayerSpecification } from '@maplibre/maplibre-react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { useVehicleMotion } from '../useVehicleMotion';
import type { VehicleMotionConfig, VehicleSample } from '../vehicleMotion';

const AnimatedSource = Animated.createAnimatedComponent(GeoJSONSource);
const emptyData = JSON.stringify({ type: 'FeatureCollection', features: [] });

export interface VehicleLayerProps {
  readonly id: string;
  readonly sample: SharedValue<VehicleSample | null>;
  readonly appearance: Pick<SymbolLayerSpecification, 'paint' | 'layout'>;
  /** easing and shouldSnap must be worklets imported from approved motion config. */
  readonly motion?: VehicleMotionConfig;
}

type CircleVehicleProps = Omit<VehicleLayerProps, 'appearance'> & {
  kind: 'circle'; appearance: Pick<CircleLayerSpecification, 'paint' | 'layout'>;
};

export function VehicleLayer(props: VehicleLayerProps | CircleVehicleProps) {
  const { id, sample, motion } = props;
  const pose = useVehicleMotion(sample, motion);
  const animatedProps = useAnimatedProps(() => ({
    // Native MLRNGeoJSONSource accepts serialized GeoJSON, not a JS object.
    data: pose.get() ? JSON.stringify({
      type: 'Feature', properties: { heading: pose.get()!.heading }, geometry: { type: 'Point', coordinates: pose.get()!.coordinate },
    }) : emptyData,
  }));
  return (
    <AnimatedSource id={`${id}-source`} data={emptyData} animatedProps={animatedProps}>
      {'kind' in props ? <Layer id={id} type="circle" {...props.appearance} /> :
        <Layer id={id} type="symbol" {...props.appearance}
          layout={{ ...props.appearance.layout, 'icon-rotate': ['get', 'heading'], 'icon-rotation-alignment': 'map' }} />}
    </AnimatedSource>
  );
}
