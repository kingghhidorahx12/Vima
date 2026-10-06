import { visualTokens as t } from '../../design/tokens';
import { motionTokens } from '../../motion/tokens';

const pinSize = t.components.iconSizesPx[2]!;
const rotatedExtension = pinSize * (Math.SQRT2 - 1) / 2;
const markerGap = t.spacing.scalePx[1]!;

/** Clearance from the bottom-anchored coordinate to the complete Vima pin artwork. */
export const passengerPinClearance = {
  top: Math.ceil(pinSize + t.spacing.scalePx[0]! + rotatedExtension +
    Math.abs(Math.min(0, motionTokens.interactionRules.pinEnterTranslateYPx)) + markerGap),
  bottom: Math.ceil(Math.max(0, rotatedExtension - t.spacing.scalePx[0]!) + markerGap),
  side: Math.ceil(pinSize * Math.SQRT2 / 2 + markerGap),
} as const;

export const locationCtaHeight = 48;
export const mapControlSize = 44;
export const mapLayersMenuWidth = 192;
