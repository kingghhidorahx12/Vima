import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated';
import { visualTokens as t } from '../design/tokens';
import { fadeTo } from './helpers';
import { useMotionPolicy } from './ReducedMotion';
import { motionTimings } from './timing';
import { mapPersonality } from './mapPersonality';
import { useMotionActive } from './useMotionActive';
import { useVimaTheme } from '../design/themes';
import { VimaText } from '../design/primitives';

/** App-owned bridge from native splash to a ready map; never waits for decorative motion. */
export function VimaLaunchSurface({ ready: contentReady, active = true }: { ready: boolean; active?: boolean }) {
  const theme = useVimaTheme();
  const { reducedMotion } = useMotionPolicy();
  const running = useMotionActive(active);
  const [released, setReleased] = useState(contentReady);
  const [stalled, setStalled] = useState(false);
  const ready = contentReady || released;
  if (contentReady && !released) setReleased(true);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setStalled(true), 10_000);
    return () => clearTimeout(timer);
  }, [ready]);
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
  return <Animated.View testID="vima-launch-surface" pointerEvents={ready ? 'none' : 'auto'} accessibilityElementsHidden={ready}
    style={[styles.surface, { backgroundColor: theme.roles.background }, surfaceStyle]}>
    <Animated.View style={[styles.brand, brandStyle]}>
      <Image source={require('../../assets/brand/vima_splash_lockup_final.png')} style={styles.symbol}
        resizeMode="contain" accessibilityLabel="Vima" />
    </Animated.View>
    {!ready ? <>
      <ActivityIndicator color={theme.roles.positiveStrong} />
      <VimaText variant="bodyRegular" accessibilityLiveRegion="polite">Preparando el mapa…</VimaText>
      {stalled ? <Pressable accessibilityRole="button" accessibilityLabel="Continuar mientras carga"
        onPress={() => setReleased(true)} style={styles.continue}>
        <VimaText variant="bodyMedium">Continuar mientras carga</VimaText>
      </Pressable> : null}
    </> : null}
  </Animated.View>;
}

const styles = StyleSheet.create({
  surface: { ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 20 },
  continue: { minHeight: 48, padding: 12, justifyContent: 'center' },
  brand: { width: 280, height: 280 * 9 / 16 },
  symbol: { width: '100%', height: '100%' },
});
