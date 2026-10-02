import type { TextStyle } from 'react-native';
import { visualTokens } from './tokens/index.ts';

/** Runtime aliases for the four bundled Inter font files, not new visual tokens. */
export const interFamilies = {
  400: 'Inter_400Regular', 500: 'Inter_500Medium', 600: 'Inter_600SemiBold', 700: 'Inter_700Bold',
} as const;

type FixedVariant = 'h1' | 'h2' | 'h3' | 'bodySmall' | 'caption';
export type TypographyChoice =
  | { variant: FixedVariant }
  | { variant: 'display'; sizePx: number }
  | { variant: 'body'; weight: 400 | 500 };

/** Preserve approved ranges: callers choose a display size and body weight explicitly. */
export function textStyle(choice: TypographyChoice): TextStyle {
  const scale = visualTokens.typography.scale;
  let size: number;
  let weight: number;
  if (choice.variant === 'display') {
    const [min, max] = scale.display.sizePxRange;
    if (!Number.isFinite(choice.sizePx) || choice.sizePx < min! || choice.sizePx > max!) {
      throw new Error('Display size must stay inside the approved range.');
    }
    size = choice.sizePx;
    weight = scale.display.weight;
  } else if (choice.variant === 'body') {
    if (!scale.body.weightRange.includes(choice.weight)) throw new Error('Unapproved body weight.');
    size = scale.body.sizePx;
    weight = choice.weight;
  } else {
    size = scale[choice.variant].sizePx;
    weight = scale[choice.variant].weight;
  }
  const family = interFamilies[weight as keyof typeof interFamilies];
  if (!family) throw new Error('Inter font file missing for approved weight.');
  return { fontFamily: family, fontSize: size };
}
