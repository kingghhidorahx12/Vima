import { MapMarker as Marker } from '../../map/MapMarker';
import { StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence } from 'react-native-reanimated';
import { visualTokens as t } from '../../design/tokens';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { motionTokens } from '../../motion/tokens';
import { pinEntrance } from '../../map/pinMotion';
import type { Place } from './model';

/** Native Vima marker with the approved origin/destination color semantics. */
export function PassengerMapPin({ place, kind }: { place: Place; kind: 'origin' | 'destination' }) {
  const color = kind === 'origin' ? t.colors.green : t.colors.red;
  const { reducedMotion } = useMotionPolicy();
  const entrance = pinEntrance(reducedMotion);
  const translateY = useSharedValue(entrance.fromY);
  const opacity = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(translateY); cancelAnimation(opacity);
    translateY.set(entrance.fromY); opacity.set(0);
    translateY.set(reducedMotion ? 0 : withSequence(
      fadeTo(entrance.settleY, entrance.enter), fadeTo(0, entrance.settle)));
    opacity.set(fadeTo(1, entrance.fade));
    return () => { cancelAnimation(translateY); cancelAnimation(opacity); };
  }, [place.id, reducedMotion, entrance.fromY, entrance.settleY, entrance.enter, entrance.settle, entrance.fade, opacity, translateY]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: translateY.get() }] }));
  return <Marker id={`passenger-${kind}-pin`} coordinate={place.coordinate} anchor="bottom">
    <Animated.View accessible={false} style={[styles.footprint, animated]}>
      <View style={[styles.pin, { backgroundColor: color }]} />
      <View style={[styles.inner, { backgroundColor: t.colors.white }]} />
    </Animated.View>
  </Marker>;
}

/** Home location dot and halo, distinct from a confirmed origin pin. */
export function PassengerUserLocation({ place, active = true }: { place: Place; active?: boolean }) {
  const { allowDecorativeLoops } = useMotionPolicy();
  const pulse = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(pulse); pulse.set(0);
    if (active && allowDecorativeLoops) pulse.set(withRepeat(fadeTo(1, {
      duration: motionTokens.durationsMs.ambient, easing: motionTimings.map.easing,
    }), -1, true));
    return () => cancelAnimation(pulse);
  }, [active, allowDecorativeLoops, pulse]);
  const halo = useAnimatedStyle(() => ({ opacity: allowDecorativeLoops ? 1 - pulse.get() * 0.6 : 1,
    transform: [{ scale: allowDecorativeLoops ? 1 + pulse.get() * 0.25 : 1 }] }));
  return <Marker id="passenger-user-location" coordinate={place.coordinate}>
    <Animated.View accessible={false} style={[styles.locationHalo, halo]}>
      <View style={styles.locationRing}><View style={styles.locationDot} /></View>
    </Animated.View>
  </Marker>;
}

const size = t.components.iconSizesPx[2]!;
const styles = StyleSheet.create({
  footprint: { width: size, height: size + t.spacing.scalePx[0]!, alignItems: 'center', justifyContent: 'flex-start' },
  pin: { width: size, height: size, borderRadius: t.radii.pillPx, transform: [{ rotate: '45deg' }],
    borderBottomRightRadius: t.radii.smallPx / 2 },
  inner: { position: 'absolute', top: t.spacing.scalePx[1], width: t.spacing.scalePx[1], height: t.spacing.scalePx[1],
    borderRadius: t.radii.pillPx },
  locationHalo: { width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], borderRadius: t.radii.pillPx,
    borderWidth: t.borders.standardWidthPx, borderColor: t.colors.blue, alignItems: 'center', justifyContent: 'center' },
  locationRing: { width: t.spacing.scalePx[6], height: t.spacing.scalePx[6], borderRadius: t.radii.pillPx,
    borderWidth: t.borders.standardWidthPx, borderColor: t.colors.blue, alignItems: 'center', justifyContent: 'center' },
  locationDot: { width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.blue, borderWidth: t.borders.standardWidthPx, borderColor: t.colors.white },
});
