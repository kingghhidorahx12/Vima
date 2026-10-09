import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { elevationStyle } from '../../design/themes/light';
import { visualTokens as t } from '../../design/tokens';
import { fadeTo } from '../../motion/helpers';
import { motionTimings } from '../../motion/timing';
import { usePressFeedback } from '../../motion/usePressFeedback';
import { useVimaTheme } from '../../design/themes';
import { VimaGlassSurface } from '../../design/components/VimaGlassSurface';

/** Mirrors map bearing; only visibility is animated. Fade is permitted by Reduced Motion. */
export function MapCompass({ bearing, ready, onPress }: {
  bearing: number; ready: boolean; onPress: () => void;
}) {
  const angle = Number.isFinite(bearing) ? ((bearing % 360) + 540) % 360 - 180 : 0;
  const visible = ready && angle !== 0;
  const feedback = usePressFeedback();
  const theme = useVimaTheme();
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
      onPressIn={visible ? feedback.onPressIn : undefined} onPressOut={visible ? feedback.onPressOut : undefined}
      onPress={onPress} style={({ pressed }) => [styles.button, pressed && { boxShadow: [] }]}>
      <VimaGlassSurface style={[StyleSheet.absoluteFill, styles.glass]} />
      <View testID="passenger-compass-needle" style={[styles.needle, { transform: [{ rotate: `${-angle}deg` }] }]}>
        <View testID="passenger-compass-north-outline" style={[styles.northOutline, { borderBottomColor: theme.roles.control }]} />
        <View testID="passenger-compass-north" style={[styles.north, { borderBottomColor: theme.roles.onAction }]} />
        <View testID="passenger-compass-south" style={[styles.south, { borderTopColor: theme.roles.control }]} />
      </View>
    </Pressable>
    </Animated.View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  position: { width: 44, height: 44 },
  button: { width: 44, height: 44, borderRadius: t.radii.pillPx,
    alignItems: 'center', justifyContent: 'center', ...elevationStyle('level1', t.colors.carbon) },
  glass: { borderRadius: t.radii.pillPx },
  needle: { width: 24, height: 24 },
  northOutline: { position: 'absolute', top: 0, left: 6, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 13,
    borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  north: { position: 'absolute', top: 3, left: 8, width: 0, height: 0,
    borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 9,
    borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  south: { position: 'absolute', top: 11, left: 6, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 13,
    borderLeftColor: 'transparent', borderRightColor: 'transparent' },
});
