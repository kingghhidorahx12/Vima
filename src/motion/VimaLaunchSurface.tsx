import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated';
import { visualTokens as t } from '../design/tokens';
import { fadeTo } from './helpers';
import { useMotionPolicy } from './ReducedMotion';
import { motionTimings } from './timing';

/** App-owned bridge from native splash to a ready map; never waits for decorative motion. */
export function VimaLaunchSurface({ ready }: { ready: boolean }) {
  const { reducedMotion } = useMotionPolicy();
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(opacity);
    opacity.set(fadeTo(ready ? 0 : 1, reducedMotion ? motionTimings.focus : motionTimings.navigation));
    return () => cancelAnimation(opacity);
  }, [opacity, ready, reducedMotion]);
  useEffect(() => {
    cancelAnimation(scale); scale.set(1);
    if (!ready && !reducedMotion) scale.set(withSequence(
      fadeTo(1.02, motionTimings.focus), fadeTo(1, motionTimings.focus)));
    return () => cancelAnimation(scale);
  }, [ready, reducedMotion, scale]);
  const surfaceStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const brandStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View pointerEvents={ready ? 'none' : 'auto'} accessibilityElementsHidden={ready}
    style={[styles.surface, surfaceStyle]}>
    <Animated.View style={[styles.brand, brandStyle]}>
      <Image source={require('../../assets/brand/vima_app_icon_final_1024.png')} style={styles.symbol}
        resizeMode="contain" accessibilityLabel="Vima" />
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  surface: { ...StyleSheet.absoluteFill, backgroundColor: t.colors.carbon,
    alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  brand: { width: 180, height: 180 },
  symbol: { width: '100%', height: '100%' },
});
