import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Animated, { cancelAnimation, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { fadeTo } from '../../motion/helpers';
import { mapPersonality } from '../../motion/mapPersonality';
import { motionDistances, motionTimings } from '../../motion/timing';
import { usePressFeedback } from '../../motion/usePressFeedback';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { elevationStyle } from '../../design/themes/light';
import { passengerSurfaces as surfaces, usePassengerPresentation } from '../../design/presentation';
import { useVimaTheme } from '../../design/themes';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaGlassSurface } from '../../design/components/VimaGlassSurface';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import { semanticHaptics } from '../../motion/haptics';
import type { TrafficLayerPreferences, MapLayerCapabilities } from '../../map/traffic';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { locationCtaHeight, mapControlSize, mapLayersMenuWidth } from './mapCameraFootprint';

const menuGap = t.spacing.scalePx[1]!;

export function MapControls({ available, capabilities, layers, open: requestedOpen, onOpen, onToggle, compass }: {
  available: boolean; layers: TrafficLayerPreferences; open: boolean;
  capabilities?: MapLayerCapabilities;
  compass?: ReactNode;
  onOpen: () => void; onToggle: (layer: keyof TrafficLayerPreferences) => void;
}) {
  const supported = capabilities ?? { traffic: available, incidents: available };
  const anyAvailable = supported.traffic || supported.incidents;
  const open = requestedOpen && anyAvailable;
  const tap = (action: () => void) => { void semanticHaptics('toggle'); action(); };
  const { reducedMotion } = useMotionPolicy();
  const theme = useVimaTheme();
  const [menuHeight, setMenuHeight] = useState(0);
  const [closed, setClosed] = useState(!open);
  const revision = useRef(0);
  const progress = useSharedValue(open ? 1 : 0);
  const travel = useSharedValue(open || reducedMotion ? 0 : motionDistances.shortEnterY);
  const finishClose = useCallback((closingRevision: number) => {
    if (closingRevision !== revision.current) return;
    setClosed(true);
    travel.set(reducedMotion ? 0 : motionDistances.shortEnterY);
  }, [reducedMotion, travel]);
  useEffect(() => {
    const currentRevision = ++revision.current;
    cancelAnimation(progress);
    cancelAnimation(travel);
    if (open) {
      progress.set(withTiming(1, { ...motionTimings.sheetSnap, reduceMotion: ReduceMotion.Never }));
      travel.set(withTiming(0, motionTimings.sheetSnap));
    } else {
      progress.set(withTiming(0, { duration: motionTimings.state.duration,
        easing: motionTimings.sheetClose.easing, reduceMotion: ReduceMotion.Never },
        (finished) => {
          if (finished) runOnJS(finishClose)(currentRevision);
        }));
      travel.set(withTiming(reducedMotion ? 0 : -motionDistances.shortEnterY,
        { duration: motionTimings.state.duration, easing: motionTimings.sheetClose.easing }));
    }
    return () => { cancelAnimation(progress); cancelAnimation(travel); };
  }, [finishClose, open, progress, reducedMotion, travel]);
  const slotMotion = useAnimatedStyle(() => ({ height: menuGap + progress.get() * (menuHeight + menuGap) }));
  const menuMotion = useAnimatedStyle(() => ({ opacity: progress.get(),
    transform: [{ translateY: reducedMotion ? 0 : travel.get() }] }));
  return <ElementEntrance style={styles.stack}>
    {compass}
    <Animated.View testID="passenger-layers-slot" pointerEvents="box-none" style={[styles.menuSlot, slotMotion]}>
      <Animated.View testID="passenger-layers-menu" pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)} style={[styles.menu, menuMotion]}>
        <VimaGlassSurface style={[StyleSheet.absoluteFill, styles.menuGlass]} />
        {!anyAvailable ? <VimaText variant="caption" style={{ color: theme.roles.disabledText }}>Capas no disponibles</VimaText> : null}
        {(['traffic', 'incidents'] as const).map((layer) => <LayerMenuRow key={layer} layer={layer}
          available={supported[layer]} checked={layers[layer]} onPress={() => tap(() => onToggle(layer))} />)}
      </Animated.View>
    </Animated.View>
    <MapControl label="Capas del mapa" icon="layers" disabled={!anyAvailable} active={open || !closed || supported.traffic && layers.traffic || supported.incidents && layers.incidents}
      expanded={open || !closed} onPress={() => { revision.current += 1; setClosed(false); tap(onOpen); }} />
  </ElementEntrance>;
}

function LayerMenuRow({ layer, available, checked, onPress }: {
  layer: keyof TrafficLayerPreferences; available: boolean; checked: boolean; onPress: () => void;
}) {
  const feedback = usePressFeedback();
  const theme = useVimaTheme();
  const presentation = usePassengerPresentation();
  return <Animated.View style={feedback.style}><Pressable accessibilityRole="switch"
    accessibilityLabel={layer === 'traffic' ? 'Tráfico' : 'Incidentes'}
    accessibilityState={{ checked: available && checked, disabled: !available }} disabled={!available}
    onPressIn={available ? feedback.onPressIn : undefined} onPressOut={available ? feedback.onPressOut : undefined} onPress={onPress}
    style={({ pressed }) => [styles.menuRow,
      layer === 'incidents' && [styles.menuDivider, { borderTopColor: theme.roles.border }], pressed && presentation.pressed]}>
    <VimaGlyph name={layer === 'traffic' ? 'traffic' : 'warning'}
      color={available && checked ? theme.roles.positive : theme.roles.control} />
    <VimaText variant="bodySmall" numberOfLines={1} style={styles.menuLabel}>{layer === 'traffic' ? 'Tráfico' : 'Incidentes'}</VimaText>
    <LayerSwitch checked={checked && available} />
  </Pressable></Animated.View>;
}

export function LocationCTA({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { reducedMotion } = useMotionPolicy();
  const feedback = usePressFeedback();
  const theme = useVimaTheme();
  return <ElementEntrance><Animated.View style={feedback.style}><Pressable accessibilityRole="button" accessibilityLabel="Tu ubicación"
    accessibilityState={{ busy }} onPressIn={feedback.onPressIn} onPressOut={feedback.onPressOut}
    onPress={() => { void semanticHaptics('toggle'); onPress(); }}
    style={({ pressed }) => [styles.location, pressed && { boxShadow: [] }]}>
    <VimaGlassSurface style={[StyleSheet.absoluteFill, styles.pillGlass]} />
    {busy && !reducedMotion ? <ActivityIndicator size="small" color={theme.roles.location} />
      : <VimaGlyph name="recenter" color={theme.roles.location} />}
    <VimaText variant="bodySmall">Tu ubicación</VimaText>
    <VimaGlyph name="chevron" color={theme.roles.controlMuted} />
  </Pressable></Animated.View></ElementEntrance>;
}

export function CenteredToast() {
  const { reducedMotion } = useMotionPolicy();
  const opacity = useSharedValue(1);
  const theme = useVimaTheme();
  useEffect(() => {
    opacity.set(withDelay(reducedMotion ? 900 : 800, fadeTo(0, { ...mapPersonality.control, duration: reducedMotion ? 100 : 200 })));
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View pointerEvents="none" style={[styles.toast, { borderColor: theme.roles.surface }, style]}>
    <VimaGlassSurface style={[StyleSheet.absoluteFill, styles.pillGlass]} />
    <VimaGlyph name="check" color={theme.roles.location} />
    <VimaText variant="caption" accessibilityLiveRegion="polite">Ubicación centrada</VimaText>
  </Animated.View>;
}

function LayerSwitch({ checked }: { checked: boolean }) {
  const { reducedMotion } = useMotionPolicy(); const progress = useSharedValue(checked ? 1 : 0);
  const theme = useVimaTheme();
  useEffect(() => { progress.set(reducedMotion ? Number(checked) : fadeTo(Number(checked), mapPersonality.layer));
    return () => cancelAnimation(progress); }, [checked, progress, reducedMotion]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * 14 }] }));
  return <View style={[styles.switch, { backgroundColor: checked ? theme.roles.positive : theme.roles.disabledSurface }]}>
    <Animated.View style={[styles.knob, { backgroundColor: theme.roles.onAction }, knob]} /></View>;
}
function MapControl({ label, icon, onPress, disabled = false, active = false, expanded = false, busy = false }: {
  label: string; icon: VimaGlyphName; onPress: () => void; disabled?: boolean; active?: boolean; expanded?: boolean; busy?: boolean;
}) {
  const { reducedMotion } = useMotionPolicy();
  const feedback = usePressFeedback();
  const theme = useVimaTheme();
  return <Animated.View style={feedback.style}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled}
      accessibilityState={{ disabled, busy, expanded: icon === 'layers' ? expanded : undefined }}
      onPressIn={disabled ? undefined : feedback.onPressIn} onPressOut={disabled ? undefined : feedback.onPressOut} onPress={onPress}
      style={({ pressed }) => [styles.button, active && { borderColor: theme.roles.positive },
        pressed && { boxShadow: [] }, disabled && styles.buttonDisabled]}>
      <VimaGlassSurface disabled={disabled} style={[StyleSheet.absoluteFill, styles.pillGlass]} />
      {busy && !reducedMotion ? <ActivityIndicator size="small" color={theme.roles.positive} />
        : <VimaGlyph name={icon === 'layers' && expanded ? 'close' : icon}
          color={active ? theme.roles.positive : theme.roles.control} />}
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  location: { ...surfaces.floating, borderRadius: t.radii.pillPx, minHeight: locationCtaHeight, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: t.spacing.scalePx[2], gap: t.spacing.scalePx[1] },
  buttonDisabled: { opacity: 0.5 },
  stack: { alignItems: 'flex-end' },
  menuSlot: { width: mapLayersMenuWidth, overflow: 'hidden' },
  menuGlass: { borderRadius: t.radii.cardPx },
  pillGlass: { borderRadius: t.radii.pillPx },
  button: { width: mapControlSize, height: mapControlSize, borderRadius: t.radii.pillPx,
    alignItems: 'center', justifyContent: 'center', borderWidth: t.borders.standardWidthPx,
    ...elevationStyle('level2', t.colors.carbon) },
  toast: { minWidth: 170, paddingHorizontal: t.spacing.scalePx[2], paddingVertical: t.spacing.scalePx[1],
    borderRadius: t.radii.pillPx, borderWidth: t.borders.standardWidthPx,
    ...elevationStyle('level1', t.colors.carbon), flexDirection: 'row', gap: t.spacing.scalePx[1], alignItems: 'center' },
  menu: { ...surfaces.floating, position: 'absolute', right: 0, bottom: menuGap,
    minWidth: mapLayersMenuWidth, padding: t.spacing.scalePx[2] },
  menuRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[2],
    borderRadius: t.radii.fieldPx, ...elevationStyle('level1', t.colors.carbon) },
  menuDivider: { borderTopWidth: t.borders.standardWidthPx },
  menuLabel: { flex: 1 },
  switch: { width: 36, height: 22, borderRadius: t.radii.pillPx,
    padding: 2, justifyContent: 'center' },
  knob: { width: 18, height: 18, borderRadius: t.radii.pillPx },
});
