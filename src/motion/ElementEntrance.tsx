import { useEffect, useState, type PropsWithChildren } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, FadeOut, FadeOutUp, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay } from 'react-native-reanimated';
import { useMotionPolicy } from './ReducedMotion';
import { fadeTo, type ApprovedTiming } from './helpers';
import { motionDistances, motionTimings } from './timing';
import { motionTokens } from './tokens';

/** Animate only the mounted unit; keyed list rows never restart on ordinary renders. */
const exitFade = FadeOut.duration(motionTimings.state.duration).easing(motionTimings.state.easing).reduceMotion(ReduceMotion.Never);
const exitMove = FadeOutUp.duration(motionTimings.state.duration).easing(motionTimings.state.easing)
  .withTargetValues({ transform: [{ translateY: -motionDistances.shortEnterY }] })
  .reduceMotion(ReduceMotion.Never);

export function ElementEntrance({ children, style, staggerIndex, timing = motionTimings.shortEnter, exit = false,
  pointerEvents, testID }: PropsWithChildren<{
  style?: StyleProp<ViewStyle>; staggerIndex?: number; timing?: ApprovedTiming; exit?: boolean;
  pointerEvents?: ViewProps['pointerEvents']; testID?: string;
}>) {
  const { reducedMotion } = useMotionPolicy();
  const progress = useSharedValue(0);
  const [delay] = useState(() => staggerIndex !== undefined && staggerIndex >= 0 && staggerIndex < 5
    ? staggerIndex * motionTokens.staggerMs : 0);
  useEffect(() => {
    progress.set(reducedMotion || !delay ? fadeTo(1, timing) : withDelay(delay, fadeTo(1, timing)));
    return () => cancelAnimation(progress);
  }, [delay, progress, reducedMotion, timing]);
  const motion = useAnimatedStyle(() => ({ opacity: progress.get(),
    transform: [{ translateY: reducedMotion ? 0 : (1 - progress.get()) * motionDistances.shortEnterY }] }));
  return <Animated.View testID={testID} pointerEvents={pointerEvents}
    exiting={exit ? reducedMotion ? exitFade : exitMove : undefined} style={[style, motion]}>{children}</Animated.View>;
}
