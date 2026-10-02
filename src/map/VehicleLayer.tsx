import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { useVehicleMotion } from './useVehicleMotion';
import type { CircleAppearance } from './models';
import type { VehicleMotionConfig, VehicleSample } from './vehicleMotion';

const AnimatedSource = Animated.createAnimatedComponent(GeoJSONSource);
const emptyData = JSON.stringify({ type: 'FeatureCollection', features: [] });
export interface VehicleLayerProps {
  readonly id: string; readonly kind: 'circle'; readonly sample: SharedValue<VehicleSample | null>;
  readonly appearance: CircleAppearance; readonly motion?: VehicleMotionConfig;
}
export function VehicleLayer({ id, sample, appearance: a, motion }: VehicleLayerProps) {
  const pose = useVehicleMotion(sample, motion);
  const animatedProps = useAnimatedProps(() => ({
    data: pose.get() ? JSON.stringify({
      type: 'Feature', properties: { heading: pose.get()!.heading },
      geometry: { type: 'Point', coordinates: pose.get()!.coordinate },
    }) : emptyData,
  }));
  return <AnimatedSource id={`${id}-source`} data={emptyData} animatedProps={animatedProps}>
    <Layer id={id} type="circle" paint={{ 'circle-radius': a.radius, 'circle-color': a.color,
      'circle-stroke-width': a.strokeWidth, 'circle-stroke-color': a.strokeColor }} />
  </AnimatedSource>;
}
