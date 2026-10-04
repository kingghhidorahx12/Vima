import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef } from 'react';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue, withDelay, withRepeat } from 'react-native-reanimated';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { fadeTo } from '../motion/helpers';
import { motionTimings } from '../motion/timing';
import { indexRoute, routeFrame, routeWindow, type RouteFeature } from './routeGeometry';
import { mapPersonality } from '../motion/mapPersonality';
import { useMotionActive } from '../motion/useMotionActive';
import { visualTokens } from '../design/tokens';
import { routeColor } from './semantics';
import type { RouteAppearance } from './models';

const AnimatedSource = Animated.createAnimatedComponent(GeoJSONSource);
const emptyData = JSON.stringify({ type: 'FeatureCollection', features: [] });

export interface RouteLayerProps {
  readonly id: string; readonly data: RouteFeature; readonly state: 'active' | 'completed';
  readonly activeTone: 'carbon' | 'greenDark' | 'accentBlue'; readonly appearance: RouteAppearance; readonly reveal?: boolean;
  readonly active?: boolean;
}
/** Vima appearance is translated here; features never carry MapLibre paint objects. */
export function RouteLayer({ id, data, appearance, state, activeTone, reveal = true, active = true }: RouteLayerProps) {
  const { reducedMotion } = useMotionPolicy();
  const running = useMotionActive(active);
  const flow = useSharedValue(0);
  const index = useMemo(() => indexRoute(data), [data]);
  useEffect(() => {
    cancelAnimation(flow); flow.set(0);
    if (running && !reducedMotion && state === 'active') flow.set(withDelay(mapPersonality.pulse.duration,
      withRepeat(fadeTo(1, { ...motionTimings.map, duration: mapPersonality.routeCycleMs }), -1, false)));
    return () => cancelAnimation(flow);
  }, [flow, index, running, reducedMotion, state]);
  const flowProps = useAnimatedProps(() => ({ data: JSON.stringify(routeWindow(index,
    running && !reducedMotion ? flow.get() : 0, mapPersonality.routeWindow)) }));
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
  return <><AnimatedSource id={`${id}-source`} data={emptyData} animatedProps={animatedProps}>
    <Layer id={`${id}-shadow`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      paint={{ 'line-width': appearance.width + 6, 'line-blur': 3,
        'line-opacity': ['*', appearance.opacity * 0.18, ['get', 'vimaRevealOpacity']], 'line-color': visualTokens.colors.carbon }} />
    <Layer id={`${id}-halo`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      paint={{ 'line-width': appearance.width + 4, 'line-blur': 2,
        'line-opacity': ['*', appearance.opacity * 0.24, ['get', 'vimaRevealOpacity']], 'line-color': color }} />
    <Layer id={id} type="line" layout={{ 'line-cap': appearance.cap, 'line-join': appearance.join }}
      paint={{ 'line-width': appearance.width, 'line-opacity': appearance.opacity,
        'line-color': ['rgba', ['get', 'vimaRed'], ['get', 'vimaGreen'], ['get', 'vimaBlue'], ['get', 'vimaRevealOpacity']] }} />
  </AnimatedSource>
    {!reducedMotion && state === 'active' ? <AnimatedSource id={`${id}-flow-source`} data={emptyData} animatedProps={flowProps}>
      <Layer id={`${id}-flow`} type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-width': appearance.width * 0.7, 'line-blur': 0.5,
          'line-opacity': ['*', mapPersonality.routeHighlightOpacity, ['coalesce', ['get', 'vimaSheenOpacity'], 0]],
          'line-color': visualTokens.colors.accentBlueSoft }} />
    </AnimatedSource> : null}</>;
}
