import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue } from 'react-native-reanimated';
import { useVimaTheme } from '../design/themes';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { fadeTo } from '../motion/helpers';
import { motionTimings } from '../motion/timing';
import { useVehicleMotion } from './useVehicleMotion';
import { createVehicleMotion, validHeading, type DriverVehicleSample } from './vehicleMotion';
import type { DriverState } from '../services/matching/contracts';

const AnimatedSource = Animated.createAnimatedComponent(GeoJSONSource);
const AnimatedLayer = Animated.createAnimatedComponent(Layer);
const images = { 'vima-driver-light': require('../../assets/driver/vehicle-light.png'),
  'vima-driver-dark': require('../../assets/driver/vehicle-dark.png') };
const motion = createVehicleMotion(() => { 'worklet'; return false; });
const empty = JSON.stringify({ type: 'FeatureCollection', features: [] });

/** Native GeoJSON updates at the existing vehicle cadence; no React frame updates. */
export function DriverVehicleMarker({ location, sequence, online = true }: {
  location?: DriverState['location']; sequence: number; online?: boolean;
}) {
  const theme = useVimaTheme(); const { reducedMotion } = useMotionPolicy();
  const sample = useSharedValue<DriverVehicleSample | null>(null);
  const pulse = useSharedValue(1);
  const acquired = useRef(false); const reconnect = useRef(false);
  const lastSample = useRef('');
  const lng = location?.coordinate[0]; const lat = location?.coordinate[1]; const heading = location?.heading; const captured = location?.receivedAt;
  useEffect(() => { if (!online) reconnect.current = true; }, [online]);
  useEffect(() => {
    if (lng === undefined || lat === undefined) { sample.set(null); acquired.current = false; lastSample.current = ''; return; }
    const key = JSON.stringify([lng, lat, heading, captured]);
    if (lastSample.current === key) return;
    lastSample.current = key;
    sample.set({ coordinate: [lng, lat], heading: validHeading(heading) ? heading : null, sequence, reconnected: reconnect.current });
    reconnect.current = false;
    if (!acquired.current) {
      acquired.current = true; pulse.set(reducedMotion ? 1 : 0);
      if (!reducedMotion) pulse.set(fadeTo(1, motionTimings.map));
    }
  }, [lng, lat, heading, captured, sequence, sample, pulse, reducedMotion]);
  useEffect(() => () => cancelAnimation(pulse), [pulse]);
  const pose = useVehicleMotion(sample, motion, { driver: true, essential: true });
  const animatedProps = useAnimatedProps(() => ({ data: pose.get() ? JSON.stringify({ type: 'Feature',
    properties: { heading: pose.get()!.heading }, geometry: { type: 'Point', coordinates: pose.get()!.coordinate } }) : empty }));
  const halo = useAnimatedProps(() => ({ paint: { 'circle-radius': reducedMotion ? 28 : 28 + pulse.get() * 8,
    'circle-color': theme.roles.positive, 'circle-opacity': reducedMotion ? 0 : (1 - pulse.get()) * 0.18 } }));
  return <><Images images={images} /><AnimatedSource id="driver-vehicle-source" data={empty} animatedProps={animatedProps}>
    <Layer id="driver-vehicle-base" type="circle" paint={{ 'circle-radius': 28, 'circle-color': theme.roles.positive, 'circle-opacity': 0.08 }} />
    <AnimatedLayer id="driver-vehicle-acquisition" type="circle" animatedProps={halo} />
    <Layer id="driver-vehicle" type="symbol" filter={['!=', ['get', 'heading'], null]} layout={{ 'icon-image': `vima-driver-${theme.name}`, 'icon-size': 1,
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-rotation-alignment': 'map', 'icon-rotate': ['get', 'heading'] }} />
    <Layer id="driver-vehicle-unoriented" type="symbol" filter={['==', ['get', 'heading'], null]}
      layout={{ 'icon-image': `vima-driver-${theme.name}`, 'icon-size': 1, 'icon-allow-overlap': true,
        'icon-ignore-placement': true, 'icon-rotation-alignment': 'viewport' }} />
  </AnimatedSource></>;
}
