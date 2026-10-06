import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { visualTokens as t } from '../design/tokens';
import { VimaGlyph } from '../design/components/VimaGlyph';
import { useMotionPolicy } from './ReducedMotion';
import { motionEasings, motionTimings } from './timing';
import { motionTokens as m } from './tokens';
import { surfaceColors } from '../design/presentation';
import { fadeTo } from './helpers';

export interface SearchCycle {
  readonly progress: SharedValue<number>;
  readonly running: boolean;
  readonly foreground: boolean;
}

/** The one decorative clock shared by input glow and matching rings. */
export function useSearchCycle(visible: boolean): SearchCycle {
  const policy = useMotionPolicy();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const cycle = useSharedValue(0);
  const running = visible && foreground && policy.allowDecorativeLoops;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    cancelAnimation(cycle);
    cycle.set(0);
    if (running) cycle.set(withRepeat(withTiming(1, {
      duration: m.durationsMs.searchCycle, easing: (value) => { 'worklet'; return value; }, reduceMotion: ReduceMotion.System,
    }), -1));
    return () => cancelAnimation(cycle);
  }, [cycle, running]);
  return { progress: cycle, running, foreground };
}

/** Two matching rings maximum, driven by the shared clock. */
export function SearchPulse({ visible, expanded, cycle }: { visible: boolean; expanded: boolean; cycle: SearchCycle }) {
  const policy = useMotionPolicy();
  const expansion = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(expansion);
    expansion.set(policy.reducedMotion || !visible || !cycle.foreground ? 0 : withTiming(expanded ? 1 : 0,
      // Linear clock only: ring() applies the approved state curve exactly once.
      { duration: m.durationsMs.map, easing: (value) => { 'worklet'; return value; }, reduceMotion: ReduceMotion.System }));
    return () => cancelAnimation(expansion);
  }, [expanded, expansion, cycle.foreground, policy.reducedMotion, visible]);
  const first = useAnimatedStyle(() => ring(expanded ? expansion.get() : cycle.progress.get(), cycle.running && visible));
  const second = useAnimatedStyle(() => ring((cycle.progress.get() + 1 / m.interactionRules.searchPulseMaxRings) % 1, cycle.running && visible));
  return <View accessible={false} pointerEvents="none" style={styles.area}>
    <View style={styles.rings}>
      <Animated.View style={[styles.ring, first]} />
      <Animated.View style={[styles.ring, second]} />
      <View style={styles.vehicle}><VimaGlyph name="car" color={t.colors.greenDark} /></View>
    </View>
  </View>;
}

/** A stationary exterior halo. Focus changes fade; only the shared cycle breathes. */
export function useSearchFocusBorder(focused: boolean) {
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.set(fadeTo(Number(focused), motionTimings.focus));
    return () => cancelAnimation(progress);
  }, [focused, progress]);
  return useAnimatedStyle(() => ({ borderColor: interpolateColor(progress.get(), [0, 1],
    [t.colors.green, t.colors.greenDark]) }));
}

export function SearchInputGlow({ cycle, focused = false, home = false }: {
  cycle: SearchCycle; focused?: boolean; home?: boolean;
}) {
  const focus = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    cancelAnimation(focus);
    focus.set(fadeTo(focused ? 1 : 0, motionTimings.focus));
    return () => cancelAnimation(focus);
  }, [focus, focused]);
  const halo = useAnimatedStyle(() => {
    const breath = cycle.running ? 1 - Math.abs(cycle.progress.get() * 2 - 1) : 0;
    return { opacity: (home ? 0.18 : 0.20) + focus.get() * m.interactionRules.inputFocusHaloBoost + breath * 0.05 };
  });
  return <Animated.View testID={home ? 'passenger-home-search-glow' : 'passenger-active-search-glow'}
    pointerEvents="none" style={[styles.inputGlow, home && styles.homeGlow, halo]} />;
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
  inputGlow: { ...StyleSheet.absoluteFill, borderRadius: t.radii.pillPx, backgroundColor: surfaceColors.brandWash,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 16, spreadDistance: 4, color: t.colors.green }] },
  homeGlow: { borderRadius: 24 },
  area: { alignItems: 'center', justifyContent: 'center', padding: t.spacing.scalePx[2] },
  rings: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
  ring: { ...StyleSheet.absoluteFill, borderRadius: t.radii.pillPx, backgroundColor: surfaceColors.brandWash,
    borderWidth: t.borders.standardWidthPx, borderColor: t.colors.greenDark },
  vehicle: { width: size / 2, height: size / 2, borderRadius: t.radii.pillPx, backgroundColor: surfaceColors.brandWash,
    alignItems: 'center', justifyContent: 'center', borderWidth: t.borders.standardWidthPx, borderColor: surfaceColors.border },
});
