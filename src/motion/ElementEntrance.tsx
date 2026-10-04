import { useEffect, type PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useMotionPolicy } from './ReducedMotion';
import { fadeTo } from './helpers';
import { motionTimings } from './timing';

/** Immediate, interruptible entry. No stagger delays and no interaction blocking. */
export function ElementEntrance({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { reducedMotion } = useMotionPolicy();
  const progress = useSharedValue(0);
  useEffect(() => { progress.set(fadeTo(1, reducedMotion ? motionTimings.focus : motionTimings.navigation));
    return () => cancelAnimation(progress); }, [progress, reducedMotion]);
  const motion = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ translateY: reducedMotion ? 0 : (1 - progress.get()) * 4 }] }));
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}
