import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { visualTokens as t } from '../design/tokens';
import { fadeTo } from '../motion/helpers';
import { mapPersonality } from '../motion/mapPersonality';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { motionTimings } from '../motion/timing';
import { useVehicleMotion } from './useVehicleMotion';
import type { CircleAppearance } from './models';
import type { VehicleMotionConfig, VehicleSample } from './vehicleMotion';

const AnimatedSource = Animated.createAnimatedComponent(GeoJSONSource);
const emptyData = JSON.stringify({ type: 'FeatureCollection', features: [] });
export interface VehicleLayerProps {
  readonly id: string; readonly kind: 'circle'; readonly sample: SharedValue<VehicleSample | null>;
  readonly appearance: CircleAppearance; readonly motion?: VehicleMotionConfig; readonly assignmentId?: string;
}
export function VehicleLayer({ id, sample, appearance: a, motion, assignmentId }: VehicleLayerProps) {
  const { reducedMotion } = useMotionPolicy();
  const pose = useVehicleMotion(sample, motion);
  const bloom = useSharedValue(1);
  const announced = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!assignmentId) { announced.current = undefined; cancelAnimation(bloom); bloom.set(1); return; }
    if (announced.current === assignmentId) {
      if (reducedMotion) { cancelAnimation(bloom); bloom.set(1); }
      return;
    }
    announced.current = assignmentId;
    cancelAnimation(bloom); bloom.set(0);
    bloom.set(fadeTo(1, reducedMotion ? motionTimings.focus : motionTimings.success));
    return () => cancelAnimation(bloom);
  }, [assignmentId, bloom, reducedMotion]);
  const animatedProps = useAnimatedProps(() => ({
    data: pose.get() ? JSON.stringify({
      type: 'Feature', properties: { heading: pose.get()!.heading,
        vimaBloomRadius: reducedMotion ? a.radius : a.radius *
          (1 + (mapPersonality.pulseScale - 1) * bloom.get()),
        vimaBloomOpacity: assignmentId ? mapPersonality.pulseOpacity * (reducedMotion
          ? 1 - bloom.get() : 4 * bloom.get() * (1 - bloom.get())) : 0 },
      geometry: { type: 'Point', coordinates: pose.get()!.coordinate },
    }) : emptyData,
  }));
  return <AnimatedSource id={`${id}-source`} data={emptyData} animatedProps={animatedProps}>
    <Layer id={`${id}-bloom`} type="circle" paint={{
      'circle-radius': ['get', 'vimaBloomRadius'], 'circle-color': t.colors.green,
      'circle-opacity': ['get', 'vimaBloomOpacity'], 'circle-blur': 0.7,
    }} />
    <Layer id={id} type="circle" paint={{ 'circle-radius': a.radius, 'circle-color': a.color,
      'circle-stroke-width': a.strokeWidth, 'circle-stroke-color': a.strokeColor }} />
  </AnimatedSource>;
}
