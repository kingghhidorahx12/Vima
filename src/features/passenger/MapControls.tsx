import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Animated, { cancelAnimation, FadeIn, FadeInDown, FadeOut, FadeOutUp, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay } from 'react-native-reanimated';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { mapPersonality } from '../../motion/mapPersonality';
import { motionDistances, motionTimings } from '../../motion/timing';
import { usePressFeedback } from '../../motion/usePressFeedback';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { elevationStyle } from '../../design/themes/light';
import { passengerSurfaces as surfaces, surfaceColors } from '../../design/presentation';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import { semanticHaptics } from '../../motion/haptics';
import type { TrafficLayerPreferences } from '../../map/traffic';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { locationCtaHeight, mapControlSize, mapLayersMenuWidth } from './mapCameraFootprint';

const menuEnter = FadeInDown.duration(motionTimings.sheetSnap.duration).easing(motionTimings.sheetSnap.easing)
  .withInitialValues({ transform: [{ translateY: motionDistances.shortEnterY }] }).reduceMotion(ReduceMotion.Never);
const menuExit = FadeOutUp.duration(motionTimings.state.duration).easing(motionTimings.sheetClose.easing)
  .withTargetValues({ transform: [{ translateY: -motionDistances.shortEnterY }] }).reduceMotion(ReduceMotion.Never);
const menuFadeIn = FadeIn.duration(motionTimings.sheetSnap.duration).easing(motionTimings.sheetSnap.easing).reduceMotion(ReduceMotion.Never);
const menuFadeOut = FadeOut.duration(motionTimings.state.duration).easing(motionTimings.sheetClose.easing).reduceMotion(ReduceMotion.Never);

export function MapControls({ available, layers, open, onOpen, onToggle, compass }: {
  available: boolean; layers: TrafficLayerPreferences; open: boolean;
  compass?: ReactNode;
  onOpen: () => void; onToggle: (layer: keyof TrafficLayerPreferences) => void;
}) {
  const tap = (action: () => void) => { void semanticHaptics('toggle'); action(); };
  const { reducedMotion } = useMotionPolicy();
  return <ElementEntrance style={styles.stack}>
    {compass}
    {open ? <Animated.View testID="passenger-layers-menu" entering={reducedMotion ? menuFadeIn : menuEnter}
      exiting={reducedMotion ? menuFadeOut : menuExit} style={styles.menu}>
      {!available ? <VimaText variant="caption" style={styles.unavailable}>Capas no disponibles</VimaText> : null}
      {(['traffic', 'incidents'] as const).map((layer) => <LayerMenuRow key={layer} layer={layer}
        available={available} checked={layers[layer]} onPress={() => tap(() => onToggle(layer))} />)}
    </Animated.View> : null}
    <MapControl label="Capas del mapa" icon="layers" active={open || available && (layers.traffic || layers.incidents)}
      expanded={open} onPress={() => tap(onOpen)} />
  </ElementEntrance>;
}

function LayerMenuRow({ layer, available, checked, onPress }: {
  layer: keyof TrafficLayerPreferences; available: boolean; checked: boolean; onPress: () => void;
}) {
  const feedback = usePressFeedback();
  return <Animated.View style={feedback.style}><Pressable accessibilityRole="switch"
    accessibilityLabel={layer === 'traffic' ? 'Tráfico' : 'Incidentes'}
    accessibilityState={{ checked: available && checked, disabled: !available }} disabled={!available}
    onPressIn={available ? feedback.onPressIn : undefined} onPressOut={available ? feedback.onPressOut : undefined} onPress={onPress}
    style={({ pressed }) => [styles.menuRow, layer === 'incidents' && styles.menuDivider, pressed && styles.rowPressed]}>
    <VimaGlyph name={layer === 'traffic' ? 'traffic' : 'warning'}
      color={available && checked ? t.colors.green : t.colors.graphite} />
    <VimaText variant="bodySmall" numberOfLines={1} style={styles.menuLabel}>{layer === 'traffic' ? 'Tráfico' : 'Incidentes'}</VimaText>
    <LayerSwitch checked={checked && available} />
  </Pressable></Animated.View>;
}

export function LocationCTA({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { reducedMotion } = useMotionPolicy();
  const feedback = usePressFeedback();
  return <ElementEntrance><Animated.View style={feedback.style}><Pressable accessibilityRole="button" accessibilityLabel="Tu ubicación"
    accessibilityState={{ busy }} onPressIn={feedback.onPressIn} onPressOut={feedback.onPressOut}
    onPress={() => { void semanticHaptics('toggle'); onPress(); }}
    style={({ pressed }) => [styles.location, pressed && styles.buttonPressed]}>
    {busy && !reducedMotion ? <ActivityIndicator size="small" color={t.colors.blue} />
      : <VimaGlyph name="recenter" color={t.colors.blue} />}
    <VimaText variant="bodySmall">Tu ubicación</VimaText>
    <VimaGlyph name="chevron" color={t.colors.gray} />
  </Pressable></Animated.View></ElementEntrance>;
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
    <VimaGlyph name="check" color={t.colors.blue} />
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
  const { reducedMotion } = useMotionPolicy();
  const feedback = usePressFeedback();
  return <Animated.View style={feedback.style}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      accessibilityState={{ disabled, busy, expanded: icon === 'layers' ? expanded : undefined }}
      onPressIn={disabled ? undefined : feedback.onPressIn} onPressOut={disabled ? undefined : feedback.onPressOut} onPress={onPress}
      style={({ pressed }) => [styles.button, active && styles.buttonActive,
        pressed && styles.buttonPressed, disabled && styles.buttonDisabled]}>
      {busy && !reducedMotion ? <ActivityIndicator size="small" color={t.colors.green} />
        : <VimaGlyph name={icon === 'layers' && expanded ? 'close' : icon}
          color={active ? t.colors.green : t.colors.graphite} />}
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  location: { ...surfaces.floating, borderRadius: t.radii.pillPx, minHeight: locationCtaHeight, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: t.spacing.scalePx[2], gap: t.spacing.scalePx[1] },
  buttonActive: { borderColor: t.colors.green },
  buttonPressed: { backgroundColor: t.colors.background, boxShadow: [] },
  buttonDisabled: { opacity: 0.5 },
  stack: { alignItems: 'flex-end', gap: t.spacing.scalePx[1] },
  button: { width: mapControlSize, height: mapControlSize, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: t.borders.standardWidthPx, borderColor: surfaceColors.border,
    ...elevationStyle('level2', t.colors.carbon) },
  toast: { minWidth: 170, paddingHorizontal: t.spacing.scalePx[2], paddingVertical: t.spacing.scalePx[1],
    borderRadius: t.radii.pillPx, backgroundColor: t.colors.accentBlueSoft, borderWidth: t.borders.standardWidthPx,
    borderColor: t.colors.white, ...elevationStyle('level1', t.colors.carbon), flexDirection: 'row', gap: t.spacing.scalePx[1], alignItems: 'center' },
  menu: { ...surfaces.floating, minWidth: mapLayersMenuWidth, padding: t.spacing.scalePx[2] },
  menuRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[2],
    backgroundColor: t.colors.white, borderRadius: t.radii.fieldPx, ...elevationStyle('level1', t.colors.carbon) },
  menuDivider: { borderTopWidth: t.borders.standardWidthPx, borderTopColor: surfaceColors.border },
  rowPressed: { backgroundColor: t.colors.background, boxShadow: [] },
  menuLabel: { flex: 1 }, unavailable: { color: t.colors.gray },
  switch: { width: 36, height: 22, borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight,
    padding: 2, justifyContent: 'center' },
  switchOn: { backgroundColor: t.colors.green },
  knob: { width: 18, height: 18, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white },
});
