import type { SharedValue } from 'react-native-reanimated';
import { useMapContext } from './MapContext';
import { VehicleLayer as LegacyVehicle } from './legacy/VehicleLayer';
import { GoogleVehicleLayer } from './google/GoogleVehicleLayer';
import type { CircleAppearance } from './models';
import type { VehicleMotionConfig, VehicleSample } from './vehicleMotion';

export interface VehicleLayerProps {
  readonly id: string; readonly sample: SharedValue<VehicleSample | null>;
  readonly kind: 'circle'; readonly appearance: CircleAppearance; readonly motion?: VehicleMotionConfig;
}
export function VehicleLayer(props: VehicleLayerProps) {
  const { provider } = useMapContext();
  const a = props.appearance;
  return provider === 'google' ? <GoogleVehicleLayer {...props} /> : <LegacyVehicle {...props}
    appearance={{ paint: { 'circle-radius': a.radius, 'circle-color': a.color,
      'circle-stroke-width': a.strokeWidth, 'circle-stroke-color': a.strokeColor } }} />;
}
