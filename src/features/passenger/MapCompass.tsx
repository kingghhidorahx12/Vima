import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { elevationStyle } from '../../design/themes/light';
import { visualTokens as t } from '../../design/tokens';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { usePressFeedback } from '../../motion/usePressFeedback';

/** Mirrors map bearing; only visibility is animated. Fade is permitted by Reduced Motion. */
export function MapCompass({ bearing, ready, onPress }: {
  bearing: number; ready: boolean; onPress: () => void;
}) {
  const angle = Number.isFinite(bearing) ? ((bearing % 360) + 540) % 360 - 180 : 0;
  const visible = ready && angle !== 0;
  const feedback = usePressFeedback();
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.set(fadeTo(Number(visible), motionTimings.focus));
    return () => cancelAnimation(opacity);
  }, [opacity, visible]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View testID="passenger-compass" pointerEvents={visible ? 'auto' : 'none'}
    accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    style={[styles.position, fade]}>
    <Animated.View style={feedback.style}>
    <Pressable accessibilityRole="button" accessibilityLabel="Orientar mapa al norte" disabled={!visible}
      onPressIn={feedback.onPressIn} onPressOut={feedback.onPressOut}
      onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={{ transform: [{ rotate: `${-angle}deg` }] }}>
        <VimaGlyph name="compass" color={t.colors.graphite} />
      </View>
    </Pressable>
    </Animated.View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  position: { width: 44, height: 44 },
  button: { width: 44, height: 44, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white,
    alignItems: 'center', justifyContent: 'center', ...elevationStyle('level1', t.colors.carbon) },
  pressed: { backgroundColor: t.colors.background },
});
