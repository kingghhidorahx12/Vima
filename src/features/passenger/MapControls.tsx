import { useEffect } from 'react';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence } from 'react-native-reanimated';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { mapPersonality } from '../../motion/mapPersonality';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { elevationStyle } from '../../design/themes/light';
import { passengerSurfaces as surfaces, surfaceColors } from '../../design/presentation';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import { semanticHaptics } from '../../motion/haptics';
import type { TrafficLayerPreferences } from '../../map/traffic';
import { ElementEntrance } from '../../motion/ElementEntrance';

export function MapControls({ available, layers, open, onOpen, onToggle }: {
  available: boolean; layers: TrafficLayerPreferences; open: boolean;
  onOpen: () => void; onToggle: (layer: keyof TrafficLayerPreferences) => void;
}) {
  const tap = (action: () => void) => { void semanticHaptics('toggle'); action(); };
  const menuOpacity = useSharedValue(0);
  useEffect(() => { menuOpacity.set(open ? fadeTo(1, mapPersonality.layer) : 0); return () => cancelAnimation(menuOpacity); }, [menuOpacity, open]);
  const menuStyle = useAnimatedStyle(() => ({ opacity: menuOpacity.get() }));
  return <ElementEntrance style={styles.stack}>
    {open ? <Animated.View style={[styles.menu, menuStyle]}>
      {!available ? <VimaText variant="caption" style={styles.unavailable}>Capas no disponibles</VimaText> : null}
      {(['traffic', 'incidents'] as const).map((layer) => <Pressable key={layer} accessibilityRole="switch"
        accessibilityLabel={layer === 'traffic' ? 'Tráfico' : 'Incidentes'}
        accessibilityState={{ checked: available && layers[layer], disabled: !available }} disabled={!available}
        onPress={() => tap(() => onToggle(layer))}
        style={({ pressed }) => [styles.menuRow, layer === 'incidents' && styles.menuDivider, pressed && styles.rowPressed]}>
        <VimaGlyph name={layer === 'traffic' ? 'traffic' : 'warning'}
          color={available && layers[layer] ? t.colors.accentBluePressed : t.colors.gray} />
        <VimaText variant="bodySmall" style={styles.menuLabel}>{layer === 'traffic' ? 'Tráfico' : 'Incidentes'}</VimaText>
        <LayerSwitch checked={layers[layer] && available} />
      </Pressable>)}
    </Animated.View> : null}
    <MapControl label="Capas del mapa" icon="layers" active={open || available && (layers.traffic || layers.incidents)}
      expanded={open} onPress={() => tap(onOpen)} />
  </ElementEntrance>;
}

export function LocationCTA({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { reducedMotion } = useMotionPolicy();
  return <ElementEntrance><Pressable accessibilityRole="button" accessibilityLabel="Tu ubicación"
    accessibilityState={{ busy }} onPress={() => { void semanticHaptics('toggle'); onPress(); }}
    style={({ pressed }) => [styles.location, pressed && surfaces.pressed]}>
    {busy && !reducedMotion ? <ActivityIndicator size="small" color={t.colors.accentBlue} />
      : <VimaGlyph name="recenter" color={t.colors.accentBluePressed} />}
    <VimaText variant="bodySmall">Tu ubicación</VimaText>
    <VimaGlyph name="chevron" color={t.colors.gray} />
  </Pressable></ElementEntrance>;
}

export function CenteredToast() {
  const { reducedMotion } = useMotionPolicy();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withDelay(reducedMotion ? 900 : 800, fadeTo(0, { ...mapPersonality.control, duration: reducedMotion ? 100 : 200 })));
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View pointerEvents="none" style={[styles.toast, style]}>
    <VimaGlyph name="check" color={t.colors.accentBluePressed} />
    <VimaText variant="caption" accessibilityLiveRegion="polite">Ubicación centrada</VimaText>
  </Animated.View>;
}

function LayerSwitch({ checked }: { checked: boolean }) {
  const { reducedMotion } = useMotionPolicy(); const progress = useSharedValue(checked ? 1 : 0);
  useEffect(() => { progress.set(reducedMotion ? Number(checked) : fadeTo(Number(checked), mapPersonality.layer));
    return () => cancelAnimation(progress); }, [checked, progress, reducedMotion]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * 14 }] }));
  return <View style={[styles.switch, checked && styles.switchOn]}><Animated.View style={[styles.knob, knob]} /></View>;
}
function MapControl({ label, icon, onPress, disabled = false, active = false, expanded = false, busy = false }: {
  label: string; icon: VimaGlyphName; onPress: () => void; disabled?: boolean; active?: boolean; expanded?: boolean; busy?: boolean;
}) {
  const { reducedMotion } = useMotionPolicy(); const progress = useSharedValue(0);
  useEffect(() => () => cancelAnimation(progress), [progress]);
  const feedback = useAnimatedStyle(() => ({ transform: [{ scale: reducedMotion ? 1 : 1 - progress.get() * (1 - mapPersonality.controlScale) }] }));
  const halo = useAnimatedStyle(() => ({ opacity: reducedMotion ? 0 : progress.get() * mapPersonality.pulseOpacity,
    transform: [{ scale: 1 + progress.get() * (mapPersonality.pulseScale - 1) }] }));
  return <Animated.View style={feedback}>
    <Animated.View pointerEvents="none" style={[styles.controlHalo, halo]} />
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      accessibilityState={{ disabled, busy, expanded: icon === 'layers' ? expanded : undefined }}
      onPressIn={() => { cancelAnimation(progress); if (!reducedMotion) progress.set(fadeTo(1, mapPersonality.control)); }}
      onPressOut={() => progress.set(reducedMotion ? 0 : fadeTo(0, mapPersonality.control))}
      onPress={() => { if (!reducedMotion) progress.set(withSequence(fadeTo(1, mapPersonality.control), fadeTo(0, mapPersonality.control))); onPress(); }}
      style={({ pressed }) => [styles.button, active && styles.buttonActive,
        pressed && (active ? styles.buttonActivePressed : styles.buttonPressed), disabled && styles.buttonDisabled]}>
      {busy && !reducedMotion ? <ActivityIndicator size="small" color={t.colors.white} />
        : <VimaGlyph name={icon === 'layers' && expanded ? 'close' : icon} color={active ? t.colors.white : t.colors.graphite} />}
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  location: { ...surfaces.floating, borderRadius: t.radii.pillPx, minHeight: 48, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: t.spacing.scalePx[2], gap: t.spacing.scalePx[1] },
  controlHalo: { ...StyleSheet.absoluteFill, borderRadius: t.radii.pillPx, backgroundColor: t.colors.accentBlue },
  buttonActive: { backgroundColor: t.colors.accentBlue, borderColor: t.colors.accentBlue },
  buttonActivePressed: { backgroundColor: t.colors.accentBluePressed, borderColor: t.colors.accentBluePressed },
  buttonPressed: { backgroundColor: t.colors.accentBlueSoft, borderColor: t.colors.accentBlue },
  buttonDisabled: { opacity: 0.5 },
  stack: { alignItems: 'flex-end', gap: t.spacing.scalePx[1] },
  button: { width: 48, height: 48, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: t.borders.standardWidthPx, borderColor: surfaceColors.border,
    ...elevationStyle('level1', t.colors.carbon) },
  toast: { minWidth: 170, paddingHorizontal: t.spacing.scalePx[2], paddingVertical: t.spacing.scalePx[1],
    borderRadius: t.radii.pillPx, backgroundColor: t.colors.accentBlueSoft, borderWidth: t.borders.standardWidthPx,
    borderColor: t.colors.white, ...elevationStyle('level1', t.colors.carbon), flexDirection: 'row', gap: t.spacing.scalePx[1], alignItems: 'center' },
  menu: { ...surfaces.floating, minWidth: 170, padding: t.spacing.scalePx[2] },
  menuRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[2] },
  menuDivider: { borderTopWidth: t.borders.standardWidthPx, borderTopColor: surfaceColors.border },
  rowPressed: { backgroundColor: t.colors.accentBlueSoft },
  menuLabel: { flex: 1 }, unavailable: { color: t.colors.gray },
  switch: { width: 36, height: 22, borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight,
    padding: 2, justifyContent: 'center' },
  switchOn: { backgroundColor: t.colors.accentBlue },
  knob: { width: 18, height: 18, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white },
});
