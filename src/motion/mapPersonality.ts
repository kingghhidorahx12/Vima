import { motionTimings } from './timing.ts';
import { motionTokens } from './tokens.ts';

/** Restrained P0 presentation; the Motion System policy and timing curves stay intact. */
export const mapPersonality = {
  pulse: { ...motionTimings.map, duration: motionTimings.success.duration * 2 },
  pulseRestMs: motionTokens.durationsMs.searchCycle,
  pulseScale: 1.18,
  pulseOpacity: motionTokens.interactionRules.searchPulseOpacityFrom * 0.5,
  routeCycleMs: motionTokens.durationsMs.searchCycle * 2,
  routeHighlightOpacity: 0.55,
  routeWindow: 0.12,
  incident: { ...motionTimings.sheetEnter, duration: motionTimings.sheetEnter.duration * 2 },
  layer: motionTimings.navigation,
  controlScale: motionTokens.interactionRules.buttonPressScale,
  control: motionTimings.focus,
  feedbackMs: 1000,
  launch: motionTimings.success,
} as const;

export function locationRingFrame(progress: number, animate: boolean) {
  'worklet';
  return { opacity: animate ? mapPersonality.pulseOpacity * (1 - progress) : 0,
    transform: [{ scale: animate ? 1 + progress * (mapPersonality.pulseScale - 1) : 1 }] };
}
