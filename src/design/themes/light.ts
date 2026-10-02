import type { ViewStyle } from 'react-native';
import { semanticColors, visualTokens } from '../tokens/index.ts';
import { textStyle } from '../typography.ts';

export const lightTheme = {
  name: 'light',
  tokens: visualTokens,
  surfaces: {
    screen: { backgroundColor: semanticColors.screenBackground },
    contrast: { backgroundColor: semanticColors.contrastSurface },
    subtle: { backgroundColor: semanticColors.disabledAndSubtleSurface },
    sheet: {
      backgroundColor: semanticColors.contrastSurface,
      borderTopLeftRadius: visualTokens.radii.sheetPx,
      borderTopRightRadius: visualTokens.radii.sheetPx,
    },
    card: { backgroundColor: semanticColors.contrastSurface, borderRadius: visualTokens.radii.cardPx },
    buttonPrimary: {
      backgroundColor: semanticColors.primaryActionAndSuccess,
      height: visualTokens.components.buttonPrimary.heightPx,
      borderRadius: visualTokens.components.buttonPrimary.radiusPx,
    },
    inputPrimary: {
      backgroundColor: semanticColors.disabledAndSubtleSurface,
      height: visualTokens.components.inputPrimary.heightPx,
      borderRadius: visualTokens.components.inputPrimary.radiusPx,
      borderWidth: visualTokens.borders.standardWidthPx,
      borderColor: visualTokens.borders.standardColor,
    },
  },
  text: {
    h1: textStyle({ variant: 'h1' }), h2: textStyle({ variant: 'h2' }), h3: textStyle({ variant: 'h3' }),
    bodyRegular: textStyle({ variant: 'body', weight: 400 }),
    bodyMedium: textStyle({ variant: 'body', weight: 500 }),
    bodySmall: textStyle({ variant: 'bodySmall' }), caption: textStyle({ variant: 'caption' }),
  },
} as const;

/** Shadow color is not specified by the handoff; require an explicit approved color. */
export function elevationStyle(level: keyof typeof visualTokens.elevation, color: string): ViewStyle {
  if (level === 'level0') return { boxShadow: [] };
  const token = visualTokens.elevation[level];
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Elevation requires an explicit opaque hex color.');
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  return { boxShadow: [{ offsetX: token.offsetX, offsetY: token.offsetY, blurRadius: token.blur,
    spreadDistance: token.spread, color: `rgba(${channels.join(', ')}, ${token.opacity})` }] };
}
