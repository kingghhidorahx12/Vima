import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { semanticHaptics } from '../../motion/haptics';
import type { HapticEvent } from '../../motion/hapticEvents';
import { usePressFeedback } from '../../motion/usePressFeedback';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { VimaText } from '../primitives';
import { primaryGradient, visualTokens as t } from '../tokens';
import { VimaGlyph, type VimaGlyphName } from './VimaGlyph';
import { surfaceColors } from '../presentation';
import { elevationStyle } from '../themes/light';
import { ElementEntrance } from '../../motion/ElementEntrance';

export function VimaButton({ label, onPress, disabled = false, loading = false, secondary = false, communication = false, gradient = false, compact = false, danger = false, haptic = 'buttonChip', style, icon }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; secondary?: boolean;
  haptic?: HapticEvent; style?: StyleProp<ViewStyle>; communication?: boolean; gradient?: boolean; compact?: boolean; danger?: boolean;
  icon?: VimaGlyphName;
}) {
  const feedback = usePressFeedback();
  const enabledProgress = useSharedValue(disabled ? 0 : 1);
  const loadingProgress = useSharedValue(loading ? 1 : 0);
  useEffect(() => {
    enabledProgress.set(fadeTo(disabled ? 0 : 1, motionTimings.feedback));
    return () => cancelAnimation(enabledProgress);
  }, [disabled, enabledProgress]);
  useEffect(() => {
    loadingProgress.set(fadeTo(loading ? 1 : 0, motionTimings.feedback));
    return () => cancelAnimation(loadingProgress);
  }, [loading, loadingProgress]);
  const disabledWash = useAnimatedStyle(() => ({ opacity: 1 - enabledProgress.get() }));
  const contentFade = useAnimatedStyle(() => ({ opacity: (1 - loadingProgress.get()) *
    (0.65 + enabledProgress.get() * 0.35) }));
  const spinnerFade = useAnimatedStyle(() => ({ opacity: loadingProgress.get() }));
  const labelColor = disabled ? t.colors.gray : danger ? t.colors.red : communication ? t.colors.accentBluePressed : secondary ? t.colors.carbon : t.colors.white;
  return <ElementEntrance style={style}><Animated.View style={feedback.style}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPressIn={disabled || loading ? undefined : feedback.onPressIn} onPressOut={disabled || loading ? undefined : feedback.onPressOut}
      onPress={() => { void semanticHaptics(haptic); onPress(); }}
      style={({ pressed }) => [styles.button, compact && styles.compact, gradient && !secondary && !disabled && styles.gradient,
        secondary && styles.secondary, communication && styles.communication, danger && styles.danger,
        pressed && !disabled && styles.pressed, disabled && styles.disabled]}>
      <Animated.View pointerEvents="none" style={[styles.disabledWash, disabledWash]} />
      <View style={styles.loadingFrame}>
        <Animated.View style={[styles.content, contentFade]}>
          {icon ? <VimaGlyph name={icon} color={labelColor} /> : null}
          <VimaText variant={compact ? 'caption' : 'bodyMedium'} style={[styles.label, { color: labelColor }]}>{label}</VimaText>
        </Animated.View>
        <Animated.View pointerEvents="none" accessibilityElementsHidden={!loading}
          style={[styles.spinnerFrame, spinnerFade]}>
          <ActivityIndicator accessibilityLabel="Cargando" animating={loading} color={labelColor} />
        </Animated.View>
      </View>
    </Pressable>
  </Animated.View></ElementEntrance>;
}
const styles = StyleSheet.create({
  pressed: { opacity: 0.9, boxShadow: [] },
  compact: { paddingHorizontal: t.spacing.scalePx[1] },
  button: { minHeight: t.components.buttonPrimary.heightPx, borderRadius: t.components.buttonPrimary.radiusPx,
    backgroundColor: t.colors.green, ...elevationStyle('level1', t.colors.carbon), justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: t.spacing.mobileHorizontalMarginPx, paddingVertical: t.spacing.scalePx[2] },
  gradient: { experimental_backgroundImage: `linear-gradient(90deg, ${primaryGradient.stops.map((stop) => `${stop.color} ${stop.position * 100}%`).join(', ')})` },
  secondary: { backgroundColor: t.colors.background, borderWidth: t.borders.standardWidthPx,
    borderColor: surfaceColors.border, boxShadow: [] },
  communication: { backgroundColor: t.colors.accentBlueSoft, borderColor: t.colors.accentBlueGlow },
  danger: { backgroundColor: surfaceColors.dangerWash, borderColor: surfaceColors.border },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.scalePx[1] },
  disabled: { borderWidth: t.borders.standardWidthPx, borderColor: surfaceColors.border, boxShadow: [] },
  disabledWash: { ...StyleSheet.absoluteFill, borderRadius: t.components.buttonPrimary.radiusPx,
    backgroundColor: t.colors.background },
  loadingFrame: { position: 'relative' },
  spinnerFrame: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  label: { textAlign: 'center', flexShrink: 1 },
});
