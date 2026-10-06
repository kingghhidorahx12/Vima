import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { textStyle, interFamilies } from '../../design/typography';
import { visualTokens as t } from '../../design/tokens';
import { passengerSurfaces } from '../../design/presentation';
import { motionDistances, motionTimings } from '../../motion/timing';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { usePressFeedback } from '../../motion/usePressFeedback';

const tabs: readonly { label: string; icon: VimaGlyphName; enabled: boolean }[] = [
  { label: 'Inicio', icon: 'home', enabled: true }, { label: 'Viajes', icon: 'clock', enabled: false },
  { label: 'Pagos', icon: 'payment', enabled: false }, { label: 'Perfil', icon: 'profile', enabled: false },
];
export const bottomNavigationHeight = (bottom: number) => Math.max(72, 56 + bottom);
const travel = motionDistances.shortEnterY * 2;
const fadeEnter = FadeIn.duration(motionTimings.navigation.duration).easing(motionTimings.navigation.easing).reduceMotion(ReduceMotion.Never);
const fadeExit = FadeOut.duration(motionTimings.navigation.duration).easing(motionTimings.sheetClose.easing).reduceMotion(ReduceMotion.Never);
const moveEnter = FadeInDown.duration(motionTimings.navigation.duration).easing(motionTimings.navigation.easing)
  .withInitialValues({ transform: [{ translateY: travel }] }).reduceMotion(ReduceMotion.Never);
const moveExit = FadeOutDown.duration(motionTimings.navigation.duration).easing(motionTimings.sheetClose.easing)
  .withTargetValues({ transform: [{ translateY: travel }] }).reduceMotion(ReduceMotion.Never);

/** Visual destinations only. The three unavailable modules have no handlers or routes. */
export function PassengerBottomNavigation({ visible, bottomInset, onHome }: { visible: boolean; bottomInset: number; onHome: () => void }) {
  const { reducedMotion } = useMotionPolicy();
  return visible ? <Animated.View testID="passenger-bottom-navigation"
    entering={reducedMotion ? fadeEnter : moveEnter} exiting={reducedMotion ? fadeExit : moveExit}
    style={[styles.navigation, { height: bottomNavigationHeight(bottomInset), paddingBottom: Math.max(8, bottomInset) }]}>
    {tabs.map(tab => <NavTab key={tab.label} tab={tab} onHome={onHome} />)}
  </Animated.View> : null;
}
function NavTab({ tab, onHome }: { tab: typeof tabs[number]; onHome: () => void }) {
  const feedback = usePressFeedback();
  return <Animated.View style={[styles.tabFrame, feedback.style]}><Pressable accessibilityRole="tab" accessibilityLabel={tab.label}
      accessibilityState={{ selected: tab.enabled, disabled: !tab.enabled }} disabled={!tab.enabled}
      accessibilityHint={tab.enabled ? undefined : 'Módulo no disponible'} onPress={tab.enabled ? onHome : undefined}
      onPressIn={tab.enabled ? feedback.onPressIn : undefined} onPressOut={tab.enabled ? feedback.onPressOut : undefined}
      style={({ pressed }) => [styles.tab, pressed && tab.enabled && passengerSurfaces.pressed]}>
      <VimaGlyph name={tab.icon} color={tab.enabled ? t.colors.green : t.colors.graphite} />
      <VimaText variant="caption" style={[styles.label, { color: tab.enabled ? t.colors.green : t.colors.graphite }]}>{tab.label}</VimaText>
    </Pressable></Animated.View>;
}
const styles = StyleSheet.create({
  navigation: { flexDirection: 'row', backgroundColor: t.colors.white, paddingTop: 8 },
  tabFrame: { flex: 1 },
  tab: { minHeight: 48, justifyContent: 'center', alignItems: 'center', gap: 4, borderRadius: t.radii.fieldPx },
  label: { ...textStyle({ variant: 'caption' }), fontFamily: interFamilies[500] },
});
