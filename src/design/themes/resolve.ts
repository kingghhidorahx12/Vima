import { darkTheme } from './dark.ts';
import { lightTheme } from './light.ts';
import type { VimaThemeName } from './index.tsx';

/** Environment is a default; persisted product preference takes precedence. */
export function resolveVimaThemeName(_development: boolean, value: string | undefined): VimaThemeName {
  return value === 'dark' ? 'dark' : 'light';
}

export function resolveVimaTheme(development: boolean, value: string | undefined) {
  return resolveVimaThemeName(development, value) === 'dark' ? darkTheme : lightTheme;
}
