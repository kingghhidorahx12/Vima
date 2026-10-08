import { MapMarker as Marker } from '../../map/MapMarker';
import { StyleSheet, View } from 'react-native';
import { useEffect, useMemo } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence } from 'react-native-reanimated';
import { visualTokens as t } from '../../design/tokens';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { pinEntrance } from '../../map/pinMotion';
import { locationRingFrame, mapPersonality } from '../../motion/mapPersonality';
import { useMotionActive } from '../../motion/useMotionActive';
import type { Place } from './model';
import { useVimaTheme } from '../../design/themes';

/** Native Vima marker with the approved origin/destination color semantics. */
export function PassengerMapPin({ place, kind }: { place: Place; kind: 'origin' | 'destination' }) {
  const theme = useVimaTheme();
  const color = kind === 'origin' ? theme.roles.positive : theme.roles.danger;
  const { reducedMotion } = useMotionPolicy();
  const entrance = useMemo(() => pinEntrance(reducedMotion), [reducedMotion]);
  const [longitude, latitude] = place.coordinate;
  const translateY = useSharedValue(entrance.fromY);
  const opacity = useSharedValue(0);
  const accent = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(translateY); cancelAnimation(opacity);
    cancelAnimation(accent); accent.set(0);
    if (!reducedMotion) accent.set(fadeTo(1, motionTimings.map));
    translateY.set(entrance.fromY); opacity.set(0);
    translateY.set(reducedMotion ? 0 : withSequence(
      fadeTo(entrance.settleY, entrance.enter), fadeTo(0, entrance.settle)));
    opacity.set(fadeTo(1, entrance.fade));
    return () => { cancelAnimation(translateY); cancelAnimation(opacity); cancelAnimation(accent); };
  }, [accent, longitude, latitude, reducedMotion, entrance, opacity, translateY]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: translateY.get() }] }));
  const halo = useAnimatedStyle(() => locationRingFrame(accent.get(), !reducedMotion));
  return <Marker id={`passenger-${kind}-pin`} coordinate={place.coordinate} anchor="bottom">
    <Animated.View accessible={false} style={[styles.footprint, animated]}>
      <View style={[styles.pin, { backgroundColor: color }]} />
      <View style={[styles.inner, { backgroundColor: theme.roles.onAction }]} />
      <Animated.View pointerEvents="none" style={[styles.pinHalo, { borderColor: color }, halo]} />
    </Animated.View>
  </Marker>;
}

/** Home location dot and halo, distinct from a confirmed origin pin. */
export function PassengerUserLocation({ place, active = true }: { place: Place; active?: boolean }) {
  const theme = useVimaTheme();
  const { allowDecorativeLoops } = useMotionPolicy();
  const pulse = useSharedValue(0);
  const running = useMotionActive(active);
  useEffect(() => {
    cancelAnimation(pulse); pulse.set(0);
    if (running && allowDecorativeLoops) pulse.set(withRepeat(withSequence(
      fadeTo(1, mapPersonality.pulse), fadeTo(1, { ...motionTimings.focus, duration: mapPersonality.pulseRestMs })), -1, false));
    return () => cancelAnimation(pulse);
  }, [running, allowDecorativeLoops, pulse]);
  const halo = useAnimatedStyle(() => locationRingFrame(pulse.get(), running && allowDecorativeLoops));
  return <Marker id="passenger-user-location" coordinate={place.coordinate}>
    <View accessible={false} style={styles.locationArea}>
      <Animated.View style={[styles.locationHalo, { borderColor: theme.roles.location, backgroundColor: theme.roles.locationWash }, halo]} />
      <View style={[styles.locationRing, { backgroundColor: theme.roles.locationWash }]}><View style={[styles.locationDot,
        { backgroundColor: theme.roles.location, borderColor: theme.roles.onAction }]} /></View>
    </View>
  </Marker>;
}

const size = t.components.iconSizesPx[2]!;
const styles = StyleSheet.create({
  pinHalo: { position: 'absolute', bottom: 0, width: size, height: size / 3,
    borderWidth: t.borders.standardWidthPx, borderRadius: t.radii.pillPx },
  footprint: { width: size, height: size + t.spacing.scalePx[0]!, alignItems: 'center', justifyContent: 'flex-start' },
  pin: { width: size, height: size, borderRadius: t.radii.pillPx, transform: [{ rotate: '45deg' }],
    borderBottomRightRadius: t.radii.smallPx / 2 },
  inner: { position: 'absolute', top: t.spacing.scalePx[1], width: t.spacing.scalePx[1], height: t.spacing.scalePx[1],
    borderRadius: t.radii.pillPx },
  locationArea: { width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], alignItems: 'center', justifyContent: 'center' },
  locationHalo: { position: 'absolute', width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], borderRadius: t.radii.pillPx,
    borderWidth: t.borders.standardWidthPx, alignItems: 'center', justifyContent: 'center' },
  locationRing: { width: t.spacing.scalePx[6], height: t.spacing.scalePx[6], borderRadius: t.radii.pillPx,
    alignItems: 'center', justifyContent: 'center' },
  locationDot: { opacity: 1, width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    borderWidth: t.borders.standardWidthPx * 2 },
});
