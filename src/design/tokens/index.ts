import source from '../../../docs/design/vima.visual.final.json' with { type: 'json' };

type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

/** The approved JSON is the runtime source, not a manually copied palette. */
export const visualTokens: DeepReadonly<typeof source> = source;
export type VisualTokens = typeof visualTokens;
export type ColorToken = keyof VisualTokens['colors'];
export type SemanticColor = keyof VisualTokens['semanticRoles'];

export function resolveColor(token: string): string {
  if (!Object.hasOwn(visualTokens.colors, token)) throw new Error(`Unknown approved color: ${token}`);
  return visualTokens.colors[token as ColorToken];
}

export const semanticColors = Object.fromEntries(
  Object.entries(visualTokens.semanticRoles).map(([role, token]) => [role, resolveColor(token)]),
) as Readonly<Record<SemanticColor, string>>;

export const primaryGradient = {
  ...visualTokens.gradientPrimary,
  stops: visualTokens.gradientPrimary.stops.map(({ token, positionPercent }) => ({
    color: resolveColor(token), position: positionPercent / 100,
  })),
} as const;

export const visualSystemStatus = 'approved-p0-with-explicit-pending-items' as const;
