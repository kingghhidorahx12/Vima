import { MapMarker as Marker } from '../../map/MapMarker';
import { StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence } from 'react-native-reanimated';
import { visualTokens as t } from '../../design/tokens';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { locationRingFrame, mapPersonality } from '../../motion/mapPersonality';
import { useMotionActive } from '../../motion/useMotionActive';
import type { Place } from './model';
import { useVimaTheme } from '../../design/themes';

export { MapPlacePin as PassengerMapPin } from '../../map/MapPlacePin';

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

const styles = StyleSheet.create({
  locationArea: { width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], alignItems: 'center', justifyContent: 'center' },
  locationHalo: { position: 'absolute', width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], borderRadius: t.radii.pillPx,
    borderWidth: t.borders.standardWidthPx, alignItems: 'center', justifyContent: 'center' },
  locationRing: { width: t.spacing.scalePx[6], height: t.spacing.scalePx[6], borderRadius: t.radii.pillPx,
    alignItems: 'center', justifyContent: 'center' },
  locationDot: { opacity: 1, width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    borderWidth: t.borders.standardWidthPx * 2 },
});
