import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { semanticHaptics } from '../../motion/haptics';
import type { HapticEvent } from '../../motion/hapticEvents';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { moveTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { motionTokens } from '../../motion/tokens';
import { VimaText } from '../primitives';
import { primaryGradient, visualTokens as t } from '../tokens';

export function VimaButton({ label, onPress, disabled = false, loading = false, secondary = false, communication = false, gradient = false, compact = false, danger = false, haptic = 'buttonChip', style }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; secondary?: boolean;
  haptic?: HapticEvent; style?: StyleProp<ViewStyle>; communication?: boolean; gradient?: boolean; compact?: boolean; danger?: boolean;
}) {
  const { reducedMotion } = useMotionPolicy();
  const scale = useSharedValue(1);
  useEffect(() => () => cancelAnimation(scale), [scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: reducedMotion ? 1 : scale.get() }] }));
  return <Animated.View style={[style, animated]}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPressIn={() => scale.set(moveTo(motionTokens.interactionRules.buttonPressScale, reducedMotion, motionTimings.press))}
      onPressOut={() => scale.set(moveTo(1, reducedMotion, motionTimings.release))}
      onPress={() => { void semanticHaptics(haptic); onPress(); }}
      style={({ pressed }) => [styles.button, pressed && !disabled && styles.pressed, compact && styles.compact, gradient && !secondary && !disabled && styles.gradient, secondary && styles.secondary, communication && styles.communication, danger && styles.danger, disabled && styles.disabled]}>
      <VimaText variant={compact ? 'caption' : 'bodyMedium'} style={[styles.label, secondary && styles.secondaryLabel, communication && styles.communicationLabel, danger && styles.dangerLabel, loading && styles.hidden]}>{label}</VimaText>
      {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} color={secondary ? t.colors.carbon : t.colors.white} /> : null}
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  pressed: { opacity: 0.88 },
  compact: { paddingHorizontal: t.spacing.scalePx[1] },
  button: { height: t.components.buttonPrimary.heightPx, borderRadius: t.components.buttonPrimary.radiusPx,
    backgroundColor: t.colors.greenDark, elevation: 2, justifyContent: 'center', alignItems: 'center', paddingHorizontal: t.spacing.mobileHorizontalMarginPx },
  gradient: { experimental_backgroundImage: `linear-gradient(90deg, ${primaryGradient.stops.map((stop) => `${stop.color} ${stop.position * 100}%`).join(', ')})` },
  secondary: { backgroundColor: t.colors.white, borderWidth: t.borders.standardWidthPx,
    borderColor: t.colors.grayLight, elevation: 1 },
  communication: { borderColor: t.colors.blue }, communicationLabel: { color: t.colors.blue },
  danger: { borderColor: t.colors.red }, dangerLabel: { color: t.colors.red },
  disabled: { backgroundColor: t.colors.grayLight, elevation: 0 }, label: { color: t.colors.white }, secondaryLabel: { color: t.colors.carbon }, hidden: { opacity: 0 },
});
