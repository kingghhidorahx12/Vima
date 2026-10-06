import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, FadeIn, FadeInDown, FadeOut, FadeOutDown, ReduceMotion, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { textStyle, interFamilies } from '../../design/typography';
import { visualTokens as t } from '../../design/tokens';
import { passengerSurfaces } from '../../design/presentation';
import { motionDistances, motionTimings } from '../../motion/timing';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { usePressFeedback } from '../../motion/usePressFeedback';
import { fadeTo } from '../../motion/helpers';

const tabs: readonly { label: string; icon: VimaGlyphName; enabled: boolean }[] = [
  { label: 'Inicio', icon: 'home', enabled: true }, { label: 'Viajes', icon: 'clock', enabled: false },
  { label: 'Pagos', icon: 'payment', enabled: false }, { label: 'Perfil', icon: 'profile', enabled: false },
];
const navigationTopPadding = 6;
const navigationTabHeight = 48;
const navigationBottomPadding = (bottom: number) => Math.max(10, bottom);
export const bottomNavigationHeight = (bottom: number) =>
  navigationTopPadding + navigationTabHeight + navigationBottomPadding(bottom);
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
    style={[styles.navigation, { height: bottomNavigationHeight(bottomInset), paddingBottom: navigationBottomPadding(bottomInset) }]}>
    {tabs.map(tab => <NavTab key={tab.label} tab={tab} onHome={onHome} />)}
  </Animated.View> : null;
}
function NavTab({ tab, onHome }: { tab: typeof tabs[number]; onHome: () => void }) {
  const feedback = usePressFeedback();
  const active = useSharedValue(tab.enabled ? 1 : 0);
  useEffect(() => {
    active.set(fadeTo(Number(tab.enabled), motionTimings.feedback));
    return () => cancelAnimation(active);
  }, [active, tab.enabled]);
  const inactiveColor = useAnimatedStyle(() => ({ opacity: 1 - active.get() }));
  const activeColor = useAnimatedStyle(() => ({ opacity: active.get() }));
  return <Animated.View style={[styles.tabFrame, feedback.style]}><Pressable accessibilityRole="tab" accessibilityLabel={tab.label}
      accessibilityState={{ selected: tab.enabled, disabled: !tab.enabled }} disabled={!tab.enabled}
      accessibilityHint={tab.enabled ? undefined : 'Módulo no disponible'} onPress={tab.enabled ? onHome : undefined}
      onPressIn={tab.enabled ? feedback.onPressIn : undefined} onPressOut={tab.enabled ? feedback.onPressOut : undefined}
      style={({ pressed }) => [styles.tab, pressed && tab.enabled && passengerSurfaces.pressed]}>
      <View style={styles.tabVisual}>
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.tabColorLayer, inactiveColor]}>
          <VimaGlyph name={tab.icon} color={t.colors.graphite} />
          <VimaText variant="caption" style={[styles.label, styles.inactiveLabel]}>{tab.label}</VimaText>
        </Animated.View>
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[styles.tabColorLayer, styles.activeLayer, activeColor]}>
          <VimaGlyph name={tab.icon} color={t.colors.greenDark} />
          <VimaText variant="caption" style={[styles.label, styles.activeLabel]}>{tab.label}</VimaText>
        </Animated.View>
      </View>
    </Pressable></Animated.View>;
}
const styles = StyleSheet.create({
  navigation: { flexDirection: 'row', backgroundColor: t.colors.white, paddingTop: navigationTopPadding },
  tabFrame: { flex: 1 },
  tab: { height: navigationTabHeight, minHeight: 44, justifyContent: 'center', alignItems: 'center', gap: 2,
    borderRadius: t.radii.fieldPx },
  tabVisual: { position: 'relative' },
  tabColorLayer: { alignItems: 'center', gap: 2 },
  activeLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  activeLabel: { color: t.colors.greenDark }, inactiveLabel: { color: t.colors.graphite },
  label: { ...textStyle({ variant: 'caption' }), fontFamily: interFamilies[500] },
});
