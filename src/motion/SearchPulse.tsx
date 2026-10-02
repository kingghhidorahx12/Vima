import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { visualTokens as t } from '../design/tokens';
import { VimaGlyph } from '../design/components/VimaGlyph';
import { useMotionPolicy } from './ReducedMotion';
import { motionEasings } from './timing';
import { motionTokens as m } from './tokens';

/** Two rings maximum; visibility and OS preference stop the loop immediately. */
export function SearchPulse({ visible, expanded }: { visible: boolean; expanded: boolean }) {
  const policy = useMotionPolicy();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const cycle = useSharedValue(0);
  const expansion = useSharedValue(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    cancelAnimation(cycle);
    cycle.set(0);
    if (visible && foreground && policy.allowDecorativeLoops) cycle.set(withRepeat(withTiming(1, {
      duration: m.durationsMs.searchCycle, easing: (value) => { 'worklet'; return value; }, reduceMotion: ReduceMotion.System,
    }), -1));
    return () => cancelAnimation(cycle);
  }, [cycle, foreground, policy.allowDecorativeLoops, visible]);
  useEffect(() => {
    cancelAnimation(expansion);
    expansion.set(policy.reducedMotion || !visible || !foreground ? 0 : withTiming(expanded ? 1 : 0,
      // Linear clock only: ring() applies the approved state curve exactly once.
      { duration: m.durationsMs.map, easing: (value) => { 'worklet'; return value; }, reduceMotion: ReduceMotion.System }));
    return () => cancelAnimation(expansion);
  }, [expanded, expansion, foreground, policy.reducedMotion, visible]);
  const first = useAnimatedStyle(() => ring(expanded ? expansion.get() : cycle.get(), policy.allowDecorativeLoops));
  const second = useAnimatedStyle(() => ring((cycle.get() + 1 / m.interactionRules.searchPulseMaxRings) % 1, policy.allowDecorativeLoops));
  return <View accessible={false} pointerEvents="none" style={styles.area}>
    <View style={styles.rings}>
      <Animated.View style={[styles.ring, first]} />
      <Animated.View style={[styles.ring, second]} />
      <View style={styles.vehicle}><VimaGlyph name="car" /></View>
    </View>
  </View>;
}
function ring(progress: number, animate: boolean) {
  'worklet';
  const eased = motionEasings.state(progress);
  return { opacity: animate ? m.interactionRules.searchPulseOpacityFrom * (1 - eased) : 0,
    transform: [{ scale: animate ? m.interactionRules.searchPulseScaleFrom +
      (m.interactionRules.searchPulseScaleTo - m.interactionRules.searchPulseScaleFrom) * eased : 1 }] };
}
const size = t.components.iconSizesPx[2]! * 4;
const styles = StyleSheet.create({
  area: { alignItems: 'center', justifyContent: 'center', padding: t.spacing.scalePx[2] },
  rings: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
  ring: { ...StyleSheet.absoluteFill, borderRadius: t.radii.pillPx, backgroundColor: t.colors.green },
  vehicle: { width: size / 2, height: size / 2, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: t.borders.standardWidthPx, borderColor: t.colors.greenDark },
});
