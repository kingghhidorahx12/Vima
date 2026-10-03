import { motionTimings } from '../motion/timing.ts';
import { motionTokens } from '../motion/tokens.ts';

export function pinEntrance(reducedMotion: boolean) {
  return {
    fromY: reducedMotion ? 0 : motionTokens.interactionRules.pinEnterTranslateYPx,
    settleY: reducedMotion ? 0 : -motionTokens.interactionRules.pinEnterTranslateYPx / 6,
    enter: motionTimings.sheetEnter,
    settle: motionTimings.press,
    fade: reducedMotion ? motionTimings.press : motionTimings.focus,
  };
}
