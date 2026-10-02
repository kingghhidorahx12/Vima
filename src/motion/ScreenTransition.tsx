import { useFocusEffect } from 'expo-router';
import { useCallback, type PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useMotionPolicy } from './ReducedMotion';
import { fadeTo } from './helpers';
import { motionTimings } from './timing';
import { motionTokens } from './tokens';

/** Use once at a route boundary, never around individual trip phases or the persistent map. */
export function ScreenTransition({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const policy = useMotionPolicy();
  const progress = useSharedValue(1);
  useFocusEffect(useCallback(() => {
    progress.set(0);
    progress.set(fadeTo(1, motionTimings.navigation));
    return () => { cancelAnimation(progress); progress.set(1); };
  }, [progress]));
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateX: policy.reducedMotion ? 0 : motionTokens.interactionRules.screenPushTranslateXPx * (1 - progress.get()) }],
  }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
