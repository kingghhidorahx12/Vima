import type { ViewStyle } from 'react-native';
import { visualTokens } from '../tokens/index.ts';
import { textStyle } from '../typography.ts';
import { elevationStyle } from './light.ts';

export const darkThemeColors = {
  base: '#0B0F0E', surface: '#121816', elevated: '#18201D', textPrimary: '#F6F8F7',
  textSecondary: '#D9DDDC', border: 'rgba(246, 248, 247, 0.12)',
} as const;

/** Driver theme B. Its public surface/text keys intentionally mirror lightTheme exactly. */
export const darkTheme = {
  name: 'dark',
  tokens: visualTokens,
  surfaces: {
    screen: { backgroundColor: darkThemeColors.base },
    contrast: { backgroundColor: darkThemeColors.surface },
    subtle: { backgroundColor: darkThemeColors.elevated },
    sheet: {
      backgroundColor: darkThemeColors.surface,
      borderTopLeftRadius: visualTokens.radii.sheetPx,
      borderTopRightRadius: visualTokens.radii.sheetPx,
      borderWidth: visualTokens.borders.standardWidthPx,
      borderColor: darkThemeColors.border,
      ...elevationStyle('level2', visualTokens.colors.carbon),
    },
    card: { backgroundColor: darkThemeColors.elevated, borderRadius: visualTokens.radii.cardPx },
    buttonPrimary: {
      backgroundColor: visualTokens.colors.green,
      height: visualTokens.components.buttonPrimary.heightPx,
      borderRadius: visualTokens.components.buttonPrimary.radiusPx,
    },
    inputPrimary: {
      backgroundColor: darkThemeColors.elevated,
      height: visualTokens.components.inputPrimary.heightPx,
      borderRadius: visualTokens.components.inputPrimary.radiusPx,
      borderWidth: visualTokens.borders.standardWidthPx,
      borderColor: darkThemeColors.border,
    },
  } satisfies Record<string, ViewStyle>,
  text: {
    h1: { color: darkThemeColors.textPrimary, ...textStyle({ variant: 'h1' }) },
    h2: { color: darkThemeColors.textPrimary, ...textStyle({ variant: 'h2' }) },
    h3: { color: darkThemeColors.textPrimary, ...textStyle({ variant: 'h3' }) },
    bodyRegular: { color: darkThemeColors.textPrimary, ...textStyle({ variant: 'body', weight: 400 }) },
    bodyMedium: { color: darkThemeColors.textPrimary, ...textStyle({ variant: 'body', weight: 500 }) },
    bodySmall: { color: darkThemeColors.textPrimary, ...textStyle({ variant: 'bodySmall' }) },
    caption: { color: darkThemeColors.textPrimary, ...textStyle({ variant: 'caption' }) },
  },
} as const;
