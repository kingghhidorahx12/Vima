import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence } from 'react-native-reanimated';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { mapPersonality } from '../../motion/mapPersonality';
import { Pressable, StyleSheet, View } from 'react-native';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import { semanticHaptics } from '../../motion/haptics';
import type { TrafficLayerPreferences } from '../../map/traffic';

export function MapControls({ available, canRecenter, layers, open, onRecenter, onOpen, onToggle, recentering = false, centered = false }: {
  recentering?: boolean; centered?: boolean;
  available: boolean; canRecenter: boolean; layers: TrafficLayerPreferences; open: boolean;
  onRecenter: () => void; onOpen: () => void; onToggle: (layer: keyof TrafficLayerPreferences) => void;
}) {
  const tap = (action: () => void) => { void semanticHaptics('toggle'); action(); };
  const menuOpacity = useSharedValue(0);
  useEffect(() => { menuOpacity.set(open ? fadeTo(1, mapPersonality.layer) : 0); return () => cancelAnimation(menuOpacity); }, [menuOpacity, open]);
  const menuStyle = useAnimatedStyle(() => ({ opacity: menuOpacity.get() }));
  return <View style={styles.stack}>
    {centered ? <View style={styles.menu}><VimaText variant="caption" accessibilityLiveRegion="polite">Ubicación centrada</VimaText></View> : null}
    {open ? <Animated.View style={[styles.menu, menuStyle]}>
      {!available ? <VimaText variant="caption" style={styles.unavailable}>Capas no disponibles</VimaText> : null}
      {(['traffic', 'incidents'] as const).map((layer) => <Pressable key={layer} accessibilityRole="switch"
        accessibilityLabel={layer === 'traffic' ? 'Tráfico' : 'Incidentes'}
        accessibilityState={{ checked: available && layers[layer], disabled: !available }} disabled={!available}
        onPress={() => tap(() => onToggle(layer))} style={styles.menuRow}>
        <VimaText variant="bodySmall" style={styles.menuLabel}>{layer === 'traffic' ? 'Tráfico' : 'Incidentes'}</VimaText>
        <LayerSwitch checked={layers[layer] && available} />
      </Pressable>)}
    </Animated.View> : null}
    <MapControl label="Centrar ubicación" icon="recenter" disabled={!canRecenter} active={recentering || centered}
      onPress={() => tap(onRecenter)} />
    <MapControl label="Capas del mapa" icon="layers" active={open} onPress={() => tap(onOpen)} />
  </View>;
}

function LayerSwitch({ checked }: { checked: boolean }) {
  const { reducedMotion } = useMotionPolicy(); const progress = useSharedValue(checked ? 1 : 0);
  useEffect(() => { progress.set(reducedMotion ? Number(checked) : fadeTo(Number(checked), mapPersonality.layer));
    return () => cancelAnimation(progress); }, [checked, progress, reducedMotion]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * 14 }] }));
  return <View style={[styles.switch, checked && styles.switchOn]}><Animated.View style={[styles.knob, knob]} /></View>;
}
function MapControl({ label, icon, onPress, disabled = false, active = false }: {
  label: string; icon: VimaGlyphName; onPress: () => void; disabled?: boolean; active?: boolean;
}) {
  const { reducedMotion } = useMotionPolicy(); const progress = useSharedValue(0);
  useEffect(() => () => cancelAnimation(progress), [progress]);
  const feedback = useAnimatedStyle(() => ({ transform: [{ scale: reducedMotion ? 1 : 1 - progress.get() * (1 - mapPersonality.controlScale) }] }));
  const halo = useAnimatedStyle(() => ({ opacity: reducedMotion ? 0 : progress.get() * mapPersonality.pulseOpacity,
    transform: [{ scale: 1 + progress.get() * (mapPersonality.pulseScale - 1) }] }));
  return <Animated.View style={feedback}>
    <Animated.View pointerEvents="none" style={[styles.controlHalo, halo]} />
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      accessibilityState={{ disabled, busy: active && icon === 'recenter', expanded: icon === 'layers' ? active : undefined }}
      onPressIn={() => { cancelAnimation(progress); if (!reducedMotion) progress.set(fadeTo(1, mapPersonality.control)); }}
      onPressOut={() => progress.set(reducedMotion ? 0 : fadeTo(0, mapPersonality.control))}
      onPress={() => { if (!reducedMotion) progress.set(withSequence(fadeTo(1, mapPersonality.control), fadeTo(0, mapPersonality.control))); onPress(); }}
      style={[styles.button, active && styles.buttonActive, disabled && styles.buttonDisabled]}>
      <VimaGlyph name={icon} color={active ? t.colors.white : t.colors.greenDark} />
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  controlHalo: { ...StyleSheet.absoluteFill, borderRadius: t.radii.pillPx, backgroundColor: t.colors.green },
  buttonActive: { backgroundColor: t.colors.greenDark }, buttonDisabled: { opacity: 0.5 },
  stack: { alignItems: 'flex-end', gap: t.spacing.scalePx[1] },
  button: { width: 48, height: 48, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: t.borders.standardWidthPx, borderColor: t.colors.grayLight, elevation: 2 },
  menu: { minWidth: 170, padding: t.spacing.scalePx[2], borderRadius: t.radii.cardPx,
    backgroundColor: t.colors.white, elevation: 3 },
  menuRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[2] },
  menuLabel: { flex: 1 }, unavailable: { color: t.colors.gray },
  switch: { width: 36, height: 22, borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight,
    padding: 2, justifyContent: 'center' },
  switchOn: { backgroundColor: t.colors.greenDark },
  knob: { width: 18, height: 18, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white },
  knobOn: { alignSelf: 'flex-end' },
});
