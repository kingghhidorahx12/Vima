import { MapMarker as Marker } from '../../map/MapMarker';
import { StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence } from 'react-native-reanimated';
import { visualTokens as t } from '../../design/tokens';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { pinEntrance } from '../../map/pinMotion';
import { locationRingFrame, mapPersonality } from '../../motion/mapPersonality';
import { useMotionActive } from '../../motion/useMotionActive';
import type { Place } from './model';

/** Native Vima marker with the approved origin/destination color semantics. */
export function PassengerMapPin({ place, kind }: { place: Place; kind: 'origin' | 'destination' }) {
  const color = kind === 'origin' ? t.colors.green : t.colors.red;
  const { reducedMotion } = useMotionPolicy();
  const entrance = pinEntrance(reducedMotion);
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
  }, [accent, place.id, reducedMotion, entrance.fromY, entrance.settleY, entrance.enter, entrance.settle, entrance.fade, opacity, translateY]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: translateY.get() }] }));
  const halo = useAnimatedStyle(() => locationRingFrame(accent.get(), !reducedMotion));
  return <Marker id={`passenger-${kind}-pin`} coordinate={place.coordinate} anchor="bottom">
    <Animated.View accessible={false} style={[styles.footprint, animated]}>
      <View style={[styles.pin, { backgroundColor: color }]} />
      <View style={[styles.inner, { backgroundColor: t.colors.white }]} />
      <Animated.View pointerEvents="none" style={[styles.pinHalo, { borderColor: color }, halo]} />
    </Animated.View>
  </Marker>;
}

/** Home location dot and halo, distinct from a confirmed origin pin. */
export function PassengerUserLocation({ place, active = true }: { place: Place; active?: boolean }) {
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
      <Animated.View style={[styles.locationHalo, halo]} />
      <View style={styles.locationRing}><View style={styles.locationDot} /></View>
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
    borderWidth: t.borders.standardWidthPx, borderColor: t.colors.accentBlue, alignItems: 'center', justifyContent: 'center' },
  locationRing: { width: t.spacing.scalePx[6], height: t.spacing.scalePx[6], borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.accentBlueGlow, alignItems: 'center', justifyContent: 'center' },
  locationDot: { opacity: 1, width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.accentBlue, borderWidth: t.borders.standardWidthPx * 2, borderColor: t.colors.white },
});
