import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useVimaTheme, useVimaThemeControl } from '../themes';
import { elevationStyle } from '../themes/light';
import { visualTokens as t } from '../tokens';
import { VimaGlyph } from './VimaGlyph';
import { usePressFeedback } from '../../motion/usePressFeedback';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';

export function VimaThemeToggle() {
  const theme = useVimaTheme(); const control = useVimaThemeControl(); const feedback = usePressFeedback();
  const { reducedMotion } = useMotionPolicy(); const dark = control.name === 'dark';
  const progress = useSharedValue(Number(dark));
  useEffect(() => { progress.set(fadeTo(Number(dark), motionTimings.focus)); return () => cancelAnimation(progress); }, [dark, progress]);
  const sun = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ rotate: `${reducedMotion ? 0 : (1 - progress.get()) * -12}deg` }] }));
  const moon = useAnimatedStyle(() => ({ opacity: 1 - progress.get(), transform: [{ rotate: `${reducedMotion ? 0 : progress.get() * 12}deg` }] }));
  return <Animated.View style={feedback.style}><Pressable accessibilityRole="button"
    accessibilityLabel={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    onPress={control.toggleTheme} onPressIn={feedback.onPressIn} onPressOut={feedback.onPressOut}
    style={({ pressed }) => [styles.button, { backgroundColor: pressed ? theme.roles.pressedSurface : theme.roles.elevatedSurface }]}>
    <Animated.View accessible={false} pointerEvents="none" style={[styles.icon, sun]}><VimaGlyph name="sun" color={theme.roles.control} /></Animated.View>
    <Animated.View accessible={false} pointerEvents="none" style={[styles.icon, moon]}><VimaGlyph name="moon" color={theme.roles.control} /></Animated.View>
  </Pressable></Animated.View>;
}
const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: t.radii.pillPx, alignItems: 'center', justifyContent: 'center', ...elevationStyle('level2', t.colors.carbon) },
  icon: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
