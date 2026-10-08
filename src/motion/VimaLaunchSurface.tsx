import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated';
import { visualTokens as t } from '../design/tokens';
import { fadeTo } from './helpers';
import { useMotionPolicy } from './ReducedMotion';
import { motionTimings } from './timing';
import { mapPersonality } from './mapPersonality';
import { useMotionActive } from './useMotionActive';
import { useVimaTheme } from '../design/themes';

/** App-owned bridge from native splash to a ready map; never waits for decorative motion. */
export function VimaLaunchSurface({ ready, active = true }: { ready: boolean; active?: boolean }) {
  const theme = useVimaTheme();
  const { reducedMotion } = useMotionPolicy();
  const running = useMotionActive(active);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(opacity);
    opacity.set(fadeTo(ready ? 0 : 1, reducedMotion ? motionTimings.focus : mapPersonality.launch));
    return () => cancelAnimation(opacity);
  }, [opacity, ready, reducedMotion]);
  useEffect(() => {
    cancelAnimation(scale); scale.set(1);
    if (!ready && !reducedMotion && running) scale.set(withSequence(
      fadeTo(1.01, { ...mapPersonality.pulse, duration: mapPersonality.pulse.duration / 2 }), fadeTo(1, { ...mapPersonality.pulse, duration: mapPersonality.pulse.duration / 2 })));
    return () => cancelAnimation(scale);
  }, [ready, reducedMotion, running, scale]);
  const surfaceStyle = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: reducedMotion ? 0 : -(1 - opacity.get()) * t.spacing.scalePx[1]! }] }));
  const brandStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View pointerEvents={ready ? 'none' : 'auto'} accessibilityElementsHidden={ready}
    style={[styles.surface, { backgroundColor: theme.roles.background }, surfaceStyle]}>
    <Animated.View style={[styles.brand, brandStyle]}>
      <Image source={require('../../assets/brand/vima_splash_lockup_final.png')} style={styles.symbol}
        resizeMode="contain" accessibilityLabel="Vima" />
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  surface: { ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  brand: { width: 280, height: 280 * 9 / 16 },
  symbol: { width: '100%', height: '100%' },
});
