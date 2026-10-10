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
import { useFreshVehicleLocation } from './useFreshVehicleLocation';

const AnimatedSource = Animated.createAnimatedComponent(GeoJSONSource);
const images = { 'vima-driver-light': require('../../assets/driver/vehicle-light.png'),
  'vima-driver-dark': require('../../assets/driver/vehicle-dark.png') };
const motion = createVehicleMotion(() => { 'worklet'; return false; });
const empty = JSON.stringify({ type: 'FeatureCollection', features: [] });

/** Native GeoJSON updates at the existing vehicle cadence; no React frame updates. */
export function DriverVehicleMarker({ location, sequence, online = true }: {
  location?: DriverState['location']; sequence: number; online?: boolean;
}) {
  return <VehicleMarker location={location} sequence={sequence} online={online} essential />;
}

/** Shared, north-facing Vima artwork (52×64, Metro @2x/@3x); no permanent badge underneath. */
export function VehicleMarker({ location: incoming, sequence, online = true, essential = false, id = 'driver-vehicle' }: {
  location?: DriverState['location']; sequence: number; online?: boolean; essential?: boolean; id?: string;
}) {
  const location = useFreshVehicleLocation(incoming);
  const theme = useVimaTheme(); const { reducedMotion } = useMotionPolicy();
  const sample = useSharedValue<DriverVehicleSample | null>(null);
  const pulse = useSharedValue(1);
  const acquired = useRef(false); const reconnect = useRef(false);
  const lastSample = useRef('');
  const accepted = useRef<{ sequence: number; captured: number } | null>(null);
  const lng = location?.coordinate[0]; const lat = location?.coordinate[1]; const heading = location?.heading; const captured = location?.receivedAt;
  useEffect(() => { if (!online) reconnect.current = true; }, [online]);
  useEffect(() => {
    if (lng === undefined || lat === undefined) { sample.set(null); acquired.current = false; lastSample.current = ''; return; }
    if (accepted.current && (sequence < accepted.current.sequence || captured! < accepted.current.captured)) return;
    const key = JSON.stringify([lng, lat, heading, captured]);
    if (lastSample.current === key) return;
    lastSample.current = key;
    accepted.current = { sequence, captured: captured! };
    sample.set({ coordinate: [lng, lat], heading: validHeading(heading) ? heading : null, sequence, reconnected: reconnect.current });
    reconnect.current = false;
    if (!acquired.current) {
      acquired.current = true; pulse.set(reducedMotion ? 1 : 0);
      if (!reducedMotion) pulse.set(fadeTo(1, motionTimings.map));
    }
  }, [lng, lat, heading, captured, sequence, sample, pulse, reducedMotion]);
  useEffect(() => () => cancelAnimation(pulse), [pulse]);
  const pose = useVehicleMotion(sample, motion, { driver: true, essential });
  const animatedProps = useAnimatedProps(() => ({ data: pose.get() ? JSON.stringify({ type: 'Feature',
    properties: { heading: pose.get()!.heading, acquisition: reducedMotion ? 1 : pulse.get() },
    geometry: { type: 'Point', coordinates: pose.get()!.coordinate } }) : empty }));
  return <><Images images={images} /><AnimatedSource id={`${id}-source`} data={empty} animatedProps={animatedProps}>
    <Layer id={`${id}-acquisition`} type="circle" paint={{
      'circle-radius': ['interpolate', ['linear'], ['get', 'acquisition'], 0, 28, 1, 36],
      'circle-color': theme.roles.positive,
      'circle-opacity': ['interpolate', ['linear'], ['get', 'acquisition'], 0, 0.18, 1, 0],
    }} />
    <Layer id={id} type="symbol" filter={['!=', ['get', 'heading'], null]} layout={{ 'icon-image': `vima-driver-${theme.name}`, 'icon-size': 1,
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'icon-rotation-alignment': 'map', 'icon-rotate': ['get', 'heading'] }} />
    <Layer id={`${id}-unoriented`} type="symbol" filter={['==', ['get', 'heading'], null]}
      layout={{ 'icon-image': `vima-driver-${theme.name}`, 'icon-size': 1, 'icon-allow-overlap': true,
        'icon-ignore-placement': true, 'icon-rotation-alignment': 'viewport' }} />
  </AnimatedSource></>;
}
