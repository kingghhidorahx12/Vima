import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { textStyle, interFamilies } from '../../design/typography';
import { visualTokens as t } from '../../design/tokens';
import { passengerSurfaces } from '../../design/presentation';
import { motionTimings } from '../../motion/timing';

const tabs: readonly { label: string; icon: VimaGlyphName; enabled: boolean }[] = [
  { label: 'Inicio', icon: 'home', enabled: true }, { label: 'Viajes', icon: 'clock', enabled: false },
  { label: 'Pagos', icon: 'payment', enabled: false }, { label: 'Perfil', icon: 'profile', enabled: false },
];
export const bottomNavigationHeight = (bottom: number) => Math.max(72, 56 + bottom);
const enter = FadeIn.duration(motionTimings.navigation.duration).easing(motionTimings.navigation.easing).reduceMotion(ReduceMotion.System);
const exit = FadeOut.duration(motionTimings.sheetClose.duration).easing(motionTimings.sheetClose.easing).reduceMotion(ReduceMotion.System);

/** Visual destinations only. The three unavailable modules have no handlers or routes. */
export function PassengerBottomNavigation({ visible, bottomInset, onHome }: { visible: boolean; bottomInset: number; onHome: () => void }) {
  return visible ? <Animated.View testID="passenger-bottom-navigation" entering={enter} exiting={exit}
    style={[styles.navigation, { height: bottomNavigationHeight(bottomInset), paddingBottom: Math.max(8, bottomInset) }]}>
    {tabs.map(tab => <Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label}
      accessibilityState={{ selected: tab.enabled, disabled: !tab.enabled }} disabled={!tab.enabled}
      accessibilityHint={tab.enabled ? undefined : 'Módulo no disponible'} onPress={tab.enabled ? onHome : undefined}
      style={({ pressed }) => [styles.tab, pressed && tab.enabled && passengerSurfaces.pressed]}>
      <VimaGlyph name={tab.icon} color={tab.enabled ? t.colors.greenDark : t.colors.graphite} />
      <VimaText variant="caption" style={[styles.label, { color: tab.enabled ? t.colors.greenDark : t.colors.graphite }]}>{tab.label}</VimaText>
    </Pressable>)}
  </Animated.View> : null;
}
const styles = StyleSheet.create({
  navigation: { flexDirection: 'row', backgroundColor: t.colors.white, paddingTop: 8 },
  tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', gap: 4, borderRadius: t.radii.fieldPx },
  label: { ...textStyle({ variant: 'caption' }), fontFamily: interFamilies[500] },
});
