import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { semanticHaptics } from '../../motion/haptics';
import type { HapticEvent } from '../../motion/hapticEvents';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { moveTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { motionTokens } from '../../motion/tokens';
import { VimaText } from '../primitives';
import { primaryGradient, visualTokens as t } from '../tokens';
import { VimaGlyph, type VimaGlyphName } from './VimaGlyph';
import { surfaceColors } from '../presentation';
import { elevationStyle } from '../themes/light';

export function VimaButton({ label, onPress, disabled = false, loading = false, secondary = false, communication = false, gradient = false, compact = false, danger = false, haptic = 'buttonChip', style, icon }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; secondary?: boolean;
  haptic?: HapticEvent; style?: StyleProp<ViewStyle>; communication?: boolean; gradient?: boolean; compact?: boolean; danger?: boolean;
  icon?: VimaGlyphName;
}) {
  const { reducedMotion } = useMotionPolicy();
  const scale = useSharedValue(1);
  useEffect(() => () => cancelAnimation(scale), [scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: reducedMotion ? 1 : scale.get() }] }));
  const labelColor = disabled ? t.colors.gray : danger ? t.colors.red : communication ? t.colors.accentBluePressed : secondary ? t.colors.carbon : t.colors.white;
  return <Animated.View style={[style, animated]}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPressIn={() => scale.set(moveTo(motionTokens.interactionRules.buttonPressScale, reducedMotion, motionTimings.press))}
      onPressOut={() => scale.set(moveTo(1, reducedMotion, motionTimings.release))}
      onPress={() => { void semanticHaptics(haptic); onPress(); }}
      style={({ pressed }) => [styles.button, compact && styles.compact, gradient && !secondary && !disabled && styles.gradient,
        secondary && styles.secondary, communication && styles.communication, danger && styles.danger,
        pressed && !disabled && styles.pressed, disabled && styles.disabled]}>
      <View style={[styles.content, loading && !reducedMotion && styles.hidden]}>
        {icon ? <VimaGlyph name={icon} color={labelColor} /> : null}
        <VimaText variant={compact ? 'caption' : 'bodyMedium'} style={[styles.label, { color: labelColor }]}>{label}</VimaText>
      </View>
      {loading && !reducedMotion ? <ActivityIndicator style={StyleSheet.absoluteFill} color={labelColor} /> : null}
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  pressed: { opacity: 0.9, boxShadow: [] },
  compact: { paddingHorizontal: t.spacing.scalePx[1] },
  button: { minHeight: t.components.buttonPrimary.heightPx, borderRadius: t.components.buttonPrimary.radiusPx,
    backgroundColor: t.colors.greenDark, ...elevationStyle('level1', t.colors.greenDark), justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: t.spacing.mobileHorizontalMarginPx, paddingVertical: t.spacing.scalePx[2] },
  gradient: { experimental_backgroundImage: `linear-gradient(90deg, ${primaryGradient.stops.map((stop) => `${stop.color} ${stop.position * 100}%`).join(', ')})` },
  secondary: { backgroundColor: t.colors.background, borderWidth: t.borders.standardWidthPx,
    borderColor: surfaceColors.border, boxShadow: [] },
  communication: { backgroundColor: t.colors.accentBlueSoft, borderColor: t.colors.accentBlueGlow },
  danger: { backgroundColor: surfaceColors.dangerWash, borderColor: surfaceColors.border },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.spacing.scalePx[1] },
  disabled: { backgroundColor: t.colors.background, borderWidth: t.borders.standardWidthPx, borderColor: surfaceColors.border, boxShadow: [] },
  label: { textAlign: 'center', flexShrink: 1 }, hidden: { opacity: 0 },
});
