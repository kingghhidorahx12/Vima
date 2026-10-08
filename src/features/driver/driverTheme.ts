import { darkTheme } from '../../design/themes/dark.ts';
import { lightTheme } from '../../design/themes/light.ts';

export type DriverThemeName = 'light' | 'dark';

export function resolveDriverThemeName(development: boolean, value: string | undefined): DriverThemeName {
  return development && value?.trim().toLowerCase() === 'dark' ? 'dark' : 'light';
}

export function resolveDriverTheme(development: boolean, value: string | undefined) {
  return resolveDriverThemeName(development, value) === 'dark' ? darkTheme : lightTheme;
}
