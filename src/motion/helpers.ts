import { ReduceMotion, withTiming, type WithTimingConfig } from 'react-native-reanimated';
export { motionSystemStatus } from './tokens';

/** Both duration and easing must come from approved Motion System v1.2. */
export type ApprovedTiming = Required<Pick<WithTimingConfig, 'duration' | 'easing'>>;

export function moveTo(value: number, reducedMotion: boolean, timing?: ApprovedTiming): number {
  'worklet';
  if (reducedMotion || !timing) return value;
  return withTiming(value, { ...timing, reduceMotion: ReduceMotion.System });
}

/** Fade/color progress remains allowed under Reduced Motion; callers must suppress spatial movement. */
export function fadeTo(value: number, timing: ApprovedTiming): number {
  'worklet';
  return withTiming(value, { ...timing, reduceMotion: ReduceMotion.Never });
}
