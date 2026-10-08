import { darkTheme } from './dark.ts';
import { lightTheme } from './light.ts';
import type { VimaThemeName } from './index.tsx';

/** Technical DEV override only. Product preference remains intentionally undecided. */
export function resolveVimaThemeName(development: boolean, value: string | undefined): VimaThemeName {
  return development && value?.trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

export function resolveVimaTheme(development: boolean, value: string | undefined) {
  return resolveVimaThemeName(development, value) === 'dark' ? darkTheme : lightTheme;
}
