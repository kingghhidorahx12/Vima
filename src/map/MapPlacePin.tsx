import { MapMarker } from './MapMarker';
import { StyleSheet, View } from 'react-native';
import { useEffect, useMemo } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated';
import { visualTokens as t } from '../design/tokens';
import { useVimaTheme } from '../design/themes';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { fadeTo } from '../motion/helpers';
import { motionTimings } from '../motion/timing';
import { locationRingFrame } from '../motion/mapPersonality';
import { pinEntrance } from './pinMotion';
import type { Coordinate } from './models';

/** Shared approved pickup/origin artwork; no Passenger flow dependency. */
export function MapPlacePin({ place, kind, id = `passenger-${kind}-pin` }: {
  place: { coordinate: Coordinate; id?: string; name?: string; address?: string }; kind: 'origin' | 'destination'; id?: string;
}) {
  const theme = useVimaTheme(); const color = kind === 'origin' ? theme.roles.positive : theme.roles.danger;
  const { reducedMotion } = useMotionPolicy();
  const entrance = useMemo(() => pinEntrance(reducedMotion), [reducedMotion]);
  const [longitude, latitude] = place.coordinate;
  const translateY = useSharedValue(entrance.fromY); const opacity = useSharedValue(0); const accent = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(translateY); cancelAnimation(opacity); cancelAnimation(accent); accent.set(0);
    if (!reducedMotion) accent.set(fadeTo(1, motionTimings.map));
    translateY.set(entrance.fromY); opacity.set(0);
    translateY.set(reducedMotion ? 0 : withSequence(fadeTo(entrance.settleY, entrance.enter), fadeTo(0, entrance.settle)));
    opacity.set(fadeTo(1, entrance.fade));
    return () => { cancelAnimation(translateY); cancelAnimation(opacity); cancelAnimation(accent); };
  }, [accent, longitude, latitude, reducedMotion, entrance, opacity, translateY]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: translateY.get() }] }));
  const halo = useAnimatedStyle(() => locationRingFrame(accent.get(), !reducedMotion));
  return <MapMarker id={id} coordinate={place.coordinate} anchor="bottom">
    <Animated.View accessible={false} style={[styles.footprint, animated]}>
      <View style={[styles.pin, { backgroundColor: color }]} />
      <View style={[styles.inner, { backgroundColor: theme.roles.onAction }]} />
      <Animated.View pointerEvents="none" style={[styles.pinHalo, { borderColor: color }, halo]} />
    </Animated.View>
  </MapMarker>;
}
const size = t.components.iconSizesPx[2]!;
const styles = StyleSheet.create({
  pinHalo: { position: 'absolute', bottom: 0, width: size, height: size / 3, borderWidth: t.borders.standardWidthPx, borderRadius: t.radii.pillPx },
  footprint: { width: size, height: size + t.spacing.scalePx[0]!, alignItems: 'center', justifyContent: 'flex-start' },
  pin: { width: size, height: size, borderRadius: t.radii.pillPx, transform: [{ rotate: '45deg' }], borderBottomRightRadius: t.radii.smallPx / 2 },
  inner: { position: 'absolute', top: t.spacing.scalePx[1], width: t.spacing.scalePx[1], height: t.spacing.scalePx[1], borderRadius: t.radii.pillPx },
});
