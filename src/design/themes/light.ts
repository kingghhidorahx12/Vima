import type { ViewStyle } from 'react-native';
import { semanticColors, visualTokens } from '../tokens/index.ts';
import { textStyle } from '../typography.ts';
import type { VimaTheme, VimaThemeRoles } from './index.tsx';

const wash = (hex: string, opacity: number) => {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${rgb.join(', ')}, ${opacity})`;
};

export const lightThemeRoles: VimaThemeRoles = {
  // Preserve the established Passenger/Driver light canvas exactly.
  background: '#F6F7F8',
  surface: semanticColors.contrastSurface,
  elevatedSurface: semanticColors.contrastSurface,
  subtleSurface: semanticColors.disabledAndSubtleSurface,
  pressedSurface: semanticColors.screenBackground,
  textPrimary: semanticColors.textPrimary,
  textSecondary: visualTokens.colors.gray,
  border: wash(visualTokens.colors.carbon, 0.08),
  disabledSurface: semanticColors.disabledAndSubtleSurface,
  disabledText: visualTokens.colors.gray,
  positive: visualTokens.colors.green,
  positiveStrong: visualTokens.colors.greenDark,
  positiveWash: wash(visualTokens.colors.greenDark, 0.06),
  location: visualTokens.colors.blue,
  locationStrong: visualTokens.colors.accentBluePressed,
  locationWash: visualTokens.colors.accentBlueSoft,
  warning: visualTokens.colors.amber,
  warningWash: wash(visualTokens.colors.amber, 0.08),
  danger: visualTokens.colors.red,
  dangerWash: wash(visualTokens.colors.red, 0.06),
  communication: visualTokens.colors.accentBluePressed,
  communicationWash: visualTokens.colors.accentBlueSoft,
  control: visualTokens.colors.graphite,
  controlMuted: visualTokens.colors.gray,
  onAction: visualTokens.colors.white,
  handle: visualTokens.colors.grayLight,
  shadow: visualTokens.colors.carbon,
  scrim: visualTokens.colors.carbon,
  mapVariant: 'light',
};

export const lightTheme = {
  name: 'light',
  tokens: visualTokens,
  roles: lightThemeRoles,
  surfaces: {
    screen: { backgroundColor: lightThemeRoles.background },
    contrast: { backgroundColor: semanticColors.contrastSurface },
    subtle: { backgroundColor: semanticColors.disabledAndSubtleSurface },
    sheet: {
      backgroundColor: semanticColors.contrastSurface,
      borderTopLeftRadius: visualTokens.radii.sheetPx,
      borderTopRightRadius: visualTokens.radii.sheetPx,
      borderWidth: visualTokens.borders.standardWidthPx,
      borderColor: lightThemeRoles.border,
      ...elevationStyle('level2', visualTokens.colors.carbon),
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
    h1: { color: semanticColors.textPrimary, ...textStyle({ variant: 'h1' }) },
    h2: { color: semanticColors.textPrimary, ...textStyle({ variant: 'h2' }) },
    h3: { color: semanticColors.textPrimary, ...textStyle({ variant: 'h3' }) },
    bodyRegular: { color: semanticColors.textPrimary, ...textStyle({ variant: 'body', weight: 400 }) },
    bodyMedium: { color: semanticColors.textPrimary, ...textStyle({ variant: 'body', weight: 500 }) },
    bodySmall: { color: semanticColors.textPrimary, ...textStyle({ variant: 'bodySmall' }) },
    caption: { color: semanticColors.textPrimary, ...textStyle({ variant: 'caption' }) },
  },
} as const satisfies VimaTheme;

/** Shadow color is not specified by the handoff; require an explicit approved color. */
export function elevationStyle(level: keyof typeof visualTokens.elevation, color: string): Pick<ViewStyle, 'boxShadow'> {
  if (level === 'level0') return { boxShadow: [] };
  const token = visualTokens.elevation[level];
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Elevation requires an explicit opaque hex color.');
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  return { boxShadow: [{ offsetX: token.offsetX, offsetY: token.offsetY, blurRadius: token.blur,
    spreadDistance: token.spread, color: `rgba(${channels.join(', ')}, ${token.opacity})` }] };
}
