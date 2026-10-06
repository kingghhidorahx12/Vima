import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
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
      onPressIn={visible ? feedback.onPressIn : undefined} onPressOut={visible ? feedback.onPressOut : undefined}
      onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View testID="passenger-compass-needle" style={[styles.needle, { transform: [{ rotate: `${-angle}deg` }] }]}>
        <View testID="passenger-compass-north-outline" style={styles.northOutline} />
        <View testID="passenger-compass-north" style={styles.north} />
        <View testID="passenger-compass-south" style={styles.south} />
      </View>
    </Pressable>
    </Animated.View>
  </Animated.View>;
}
const styles = StyleSheet.create({
  position: { width: 44, height: 44 },
  button: { width: 44, height: 44, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white,
    alignItems: 'center', justifyContent: 'center', ...elevationStyle('level1', t.colors.carbon) },
  pressed: { backgroundColor: t.colors.background, boxShadow: [] },
  needle: { width: 24, height: 24 },
  northOutline: { position: 'absolute', top: 0, left: 6, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 13,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: t.colors.graphite },
  north: { position: 'absolute', top: 3, left: 8, width: 0, height: 0,
    borderLeftWidth: 4, borderRightWidth: 4, borderBottomWidth: 9,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: t.colors.white },
  south: { position: 'absolute', top: 11, left: 6, width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 13,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: t.colors.graphite },
});
