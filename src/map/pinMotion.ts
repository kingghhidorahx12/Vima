import { motionTimings } from '../motion/timing.ts';
import { motionTokens } from '../motion/tokens.ts';

export function pinEntrance(reducedMotion: boolean) {
  return {
    fromY: reducedMotion ? 0 : motionTokens.interactionRules.pinEnterTranslateYPx,
    settleY: reducedMotion ? 0 : -motionTokens.interactionRules.pinEnterTranslateYPx / 12,
    enter: motionTimings.sheetEnter,
    // Keep the approved 420 ms map entrance when the independent press token changes.
    settle: { ...motionTimings.press, duration: motionTimings.map.duration - motionTimings.sheetEnter.duration },
    fade: reducedMotion ? motionTimings.press : motionTimings.focus,
  };
}
