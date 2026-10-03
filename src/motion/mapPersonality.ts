import { motionTimings } from './timing.ts';
import { motionTokens } from './tokens.ts';

/** Approved P0 board, expressed through the existing Motion System timings. */
export const mapPersonality = {
  pulse: { ...motionTimings.map, duration: motionTimings.map.duration + motionTimings.sheetEnter.duration },
  pulseRestMs: motionTokens.durationsMs.searchCycle,
  pulseScale: 1.25,
  pulseOpacity: motionTokens.interactionRules.searchPulseOpacityFrom,
  routeCycleMs: motionTokens.durationsMs.searchCycle * 2,
  routeHighlightOpacity: 0.24,
  routeWindow: 0.12,
  incident: { ...motionTimings.sheetEnter, duration: motionTimings.sheetEnter.duration * 2 },
  layer: motionTimings.navigation,
  controlScale: 0.92,
  control: motionTimings.focus,
  feedbackMs: 1000,
  launch: { ...motionTimings.navigation, duration: motionTimings.map.duration + motionTimings.sheetEnter.duration },
} as const;

export function locationRingFrame(progress: number, animate: boolean) {
  'worklet';
  return { opacity: animate ? mapPersonality.pulseOpacity * (1 - progress) : 0,
    transform: [{ scale: animate ? 1 + progress * (mapPersonality.pulseScale - 1) : 1 }] };
}
