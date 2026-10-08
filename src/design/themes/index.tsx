import { createContext, useContext, type PropsWithChildren } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import type { VisualTokens } from '../tokens';

export interface VimaTheme {
  readonly name: string;
  readonly tokens: VisualTokens;
  readonly surfaces: Readonly<Record<string, ViewStyle>>;
  readonly text: Readonly<Record<string, TextStyle>>;
}

const ThemeContext = createContext<VimaTheme | null>(null);

/** Only approved themes may be mounted. */
export function VimaThemeProvider({ theme, children }: PropsWithChildren<{ theme: VimaTheme }>) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useVimaTheme(): VimaTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('Visual System v1 values must be imported before rendering Vima primitives.');
  return theme;
}
