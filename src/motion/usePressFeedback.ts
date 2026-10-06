import { useEffect } from 'react';
import { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { moveTo } from './helpers';
import { useMotionPolicy } from './ReducedMotion';
import { motionTimings } from './timing';
import { motionTokens } from './tokens';

/** One interruptible press response for passenger controls; never delays their actions. */
export function usePressFeedback() {
  const { reducedMotion } = useMotionPolicy();
  const scale = useSharedValue(1);
  useEffect(() => () => cancelAnimation(scale), [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: reducedMotion ? 1 : scale.get() }] }));
  const onPressIn = () => { cancelAnimation(scale);
    scale.set(moveTo(motionTokens.interactionRules.buttonPressScale, reducedMotion, motionTimings.press)); };
  const onPressOut = () => { cancelAnimation(scale); scale.set(moveTo(1, reducedMotion, motionTimings.press)); };
  return { style, onPressIn, onPressOut };
}
