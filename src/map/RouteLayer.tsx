import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue } from 'react-native-reanimated';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { fadeTo } from '../motion/helpers';
import { motionTimings } from '../motion/timing';
import { routeFrame, type RouteFeature } from './routeGeometry';
import { routeColor } from './semantics';
import type { RouteAppearance } from './models';

const AnimatedSource = Animated.createAnimatedComponent(GeoJSONSource);
const emptyData = JSON.stringify({ type: 'FeatureCollection', features: [] });

export interface RouteLayerProps {
  readonly id: string; readonly data: RouteFeature; readonly state: 'active' | 'completed';
  readonly activeTone: 'carbon' | 'greenDark'; readonly appearance: RouteAppearance; readonly reveal?: boolean;
}
/** Vima appearance is translated here; features never carry MapLibre paint objects. */
export function RouteLayer({ id, data, appearance, state, activeTone, reveal = true }: RouteLayerProps) {
  const { reducedMotion } = useMotionPolicy();
  const progress = useSharedValue(reveal ? 0 : 1);
  const mounted = useRef(false);
  const geometryKey = JSON.stringify(data.geometry);
  const color = routeColor(state, activeTone);
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const red = useSharedValue(channels[0]!);
  const green = useSharedValue(channels[1]!);
  const blue = useSharedValue(channels[2]!);
  const [r, g, b] = channels as [number, number, number];
  useEffect(() => {
    cancelAnimation(progress);
    if (mounted.current) progress.set(1); // Route recalculation must not flash back to its start.
    else {
      mounted.current = true;
      progress.set(reveal ? 0 : 1);
      if (reveal) progress.set(fadeTo(1, reducedMotion ? motionTimings.focus : { ...motionTimings.map,
        duration: motionTimings.map.duration + motionTimings.sheetEnter.duration }));
    }
    return () => cancelAnimation(progress);
  }, [geometryKey, progress, reducedMotion, reveal]);
  useEffect(() => {
    red.set(fadeTo(r, motionTimings.map)); green.set(fadeTo(g, motionTimings.map)); blue.set(fadeTo(b, motionTimings.map));
    return () => { cancelAnimation(red); cancelAnimation(green); cancelAnimation(blue); };
  }, [r, g, b, red, green, blue]);
  const animatedProps = useAnimatedProps(() => {
    const frame = routeFrame(data, progress.get(), reducedMotion);
    return { data: JSON.stringify({ ...frame, properties: { ...frame.properties,
      vimaRed: red.get(), vimaGreen: green.get(), vimaBlue: blue.get() } }) };
  });
  return <AnimatedSource id={`${id}-source`} data={emptyData} animatedProps={animatedProps}>
    <Layer id={id} type="line" layout={{ 'line-cap': appearance.cap, 'line-join': appearance.join }}
      paint={{ 'line-width': appearance.width, 'line-opacity': appearance.opacity,
        'line-color': ['rgba', ['get', 'vimaRed'], ['get', 'vimaGreen'], ['get', 'vimaBlue'], ['get', 'vimaRevealOpacity']] }} />
  </AnimatedSource>;
}
