import { useEffect } from 'react';
import { Polyline } from 'react-native-maps';
import Animated, { cancelAnimation, useAnimatedProps, useSharedValue } from 'react-native-reanimated';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import type { RouteLayerProps } from '../RouteLayer';
import { routeFrame } from '../routeGeometry';
import { routeColor } from '../semantics';
import { googleCoordinate } from './camera';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
function RouteLine({ data, appearance, state, activeTone, reveal = true, index }: RouteLayerProps & { index: number }) {
  const { reducedMotion } = useMotionPolicy();
  const progress = useSharedValue(reveal ? 0 : 1);
  const geometryKey = JSON.stringify(data.geometry);
  const color = routeColor(state, activeTone);
  const [r, g, b] = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)) as [number, number, number];
  const red = useSharedValue(r); const green = useSharedValue(g); const blue = useSharedValue(b);
  useEffect(() => {
    cancelAnimation(progress); progress.set(reveal ? 0 : 1);
    if (reveal) progress.set(fadeTo(1, motionTimings.map));
    return () => cancelAnimation(progress);
  }, [geometryKey, progress, reveal]);
  useEffect(() => {
    red.set(fadeTo(r, motionTimings.map)); green.set(fadeTo(g, motionTimings.map)); blue.set(fadeTo(b, motionTimings.map));
    return () => { cancelAnimation(red); cancelAnimation(green); cancelAnimation(blue); };
  }, [r, g, b, red, green, blue]);
  const animatedProps = useAnimatedProps(() => {
    const frame = routeFrame(data, progress.get(), reducedMotion);
    const coordinates = frame.geometry.type === 'LineString' ? frame.geometry.coordinates : frame.geometry.coordinates[index] ?? [];
    return { coordinates: coordinates.map(googleCoordinate),
      strokeColor: `rgba(${Math.round(red.get())},${Math.round(green.get())},${Math.round(blue.get())},${appearance.opacity * Number(frame.properties?.vimaRevealOpacity ?? 1)})` };
  });
  const firstFrame = routeFrame(data, reveal ? 0 : 1, reducedMotion);
  const initial = firstFrame.geometry.type === 'LineString' ? firstFrame.geometry.coordinates : firstFrame.geometry.coordinates[index] ?? [];
  return <AnimatedPolyline coordinates={initial.map(googleCoordinate)} animatedProps={animatedProps}
    strokeColor={reveal && reducedMotion ? 'transparent' : color} strokeWidth={appearance.width} lineCap={appearance.cap} lineJoin={appearance.join} />;
}
/** Disconnected segments stay disconnected, never introduce straight connectors. */
export function GoogleRouteLayer(props: RouteLayerProps) {
  const lines = props.data.geometry.type === 'LineString' ? [props.data.geometry.coordinates] : props.data.geometry.coordinates;
  return <>{lines.map((_, index) => <RouteLine key={index} {...props} index={index} />)}</>;
}
