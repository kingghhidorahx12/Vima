import { useEffect, useRef, type PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useMotionPolicy } from './ReducedMotion';
import { fadeTo } from './helpers';
import { motionDistances, motionTimings } from './timing';

// Keep the full sheet legible while its content changes; only its small entry cue fades.
export const passengerSceneOpacityFloor = 0.8;

export function passengerSceneStyle(progress: number, reducedMotion: boolean) {
  'worklet';
  return {
    opacity: passengerSceneOpacityFloor + (1 - passengerSceneOpacityFloor) * progress,
    transform: [{ translateY: reducedMotion ? 0 : (1 - progress) * motionDistances.sceneTransitionY }],
  };
}

export function PassengerScenePresence({ scene, children, style }: PropsWithChildren<{
  scene: string; style?: StyleProp<ViewStyle>;
}>) {
  const { reducedMotion } = useMotionPolicy();
  const previousScene = useRef(scene);
  const progress = useSharedValue(1);

  useEffect(() => {
    if (previousScene.current === scene) return;
    previousScene.current = scene;
    cancelAnimation(progress);
    // A transition already in flight continues from its current value; a settled
    // scene gets one fresh entry cue. No exiting tree or queued animation is kept.
    if (progress.get() >= 1) progress.set(0);
    progress.set(fadeTo(1, scene === 'matching' || scene === 'assigned'
      ? motionTimings.sceneSurface : motionTimings.scene));
  }, [scene, progress]);
  useEffect(() => () => cancelAnimation(progress), [progress]);

  const animatedStyle = useAnimatedStyle(() => passengerSceneStyle(progress.get(), reducedMotion));
  return <Animated.View testID="passenger-phase-presence" style={[style, animatedStyle]}>{children}</Animated.View>;
}
