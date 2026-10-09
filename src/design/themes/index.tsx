import { createContext, useContext, type PropsWithChildren } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import type { BlurTint } from 'expo-blur';
import type { VisualTokens } from '../tokens';

export type VimaThemeName = 'light' | 'dark';
export type VimaSurfaceVariant = 'screen' | 'contrast' | 'subtle' | 'sheet' | 'card' | 'buttonPrimary' | 'inputPrimary';
export type VimaTextVariant = 'h1' | 'h2' | 'h3' | 'bodyRegular' | 'bodyMedium' | 'bodySmall' | 'caption';
export interface VimaThemeRoles {
  readonly background: string;
  readonly surface: string;
  readonly elevatedSurface: string;
  readonly subtleSurface: string;
  readonly pressedSurface: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly border: string;
  readonly disabledSurface: string;
  readonly disabledText: string;
  readonly positive: string;
  readonly positiveStrong: string;
  readonly positiveWash: string;
  readonly location: string;
  readonly locationStrong: string;
  readonly locationWash: string;
  readonly warning: string;
  readonly warningWash: string;
  readonly danger: string;
  readonly dangerWash: string;
  readonly communication: string;
  readonly communicationWash: string;
  readonly control: string;
  readonly controlMuted: string;
  readonly onAction: string;
  readonly handle: string;
  readonly shadow: string;
  readonly scrim: string;
  readonly mapVariant: VimaThemeName;
}

export interface VimaGlassTokens {
  readonly base: string;
  readonly border: string;
  readonly highlight: string;
  readonly pressed: string;
  readonly disabled: string;
  readonly shadow: string;
  readonly tint: BlurTint;
  readonly intensity: number;
}

export interface VimaTheme {
  readonly name: VimaThemeName;
  readonly tokens: VisualTokens;
  readonly roles: VimaThemeRoles;
  readonly glass: VimaGlassTokens;
  readonly surfaces: Readonly<Record<VimaSurfaceVariant, ViewStyle>>;
  readonly text: Readonly<Record<VimaTextVariant, TextStyle>>;
}

const ThemeContext = createContext<VimaTheme | null>(null);
export interface VimaThemeControl { name: VimaThemeName; setTheme(name: VimaThemeName): void; toggleTheme(): void }
export const VimaThemeControlContext = createContext<VimaThemeControl | null>(null);
export function useVimaThemeControl() {
  const control = useContext(VimaThemeControlContext);
  if (!control) throw new Error('Theme control requires RootProviders');
  return control;
}

/** Only approved themes may be mounted. */
export function VimaThemeProvider({ theme, children }: PropsWithChildren<{ theme: VimaTheme }>) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useVimaTheme(): VimaTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('Visual System v1 values must be imported before rendering Vima primitives.');
  return theme;
}
