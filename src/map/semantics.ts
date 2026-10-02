import { resolveColor, visualTokens } from '../design/tokens/index.ts';

export const mapColors = {
  origin: resolveColor(visualTokens.mapSemantics.origin),
  destination: resolveColor(visualTokens.mapSemantics.destination),
  routeCompleted: resolveColor(visualTokens.mapSemantics.routeCompleted),
  communication: resolveColor(visualTokens.mapSemantics.communicationAction),
  wait: resolveColor(visualTokens.mapSemantics.waitWarning),
};

/** Both active-route choices are approved; the caller must provide the actual context. */
export function routeColor(state: 'active' | 'completed', activeTone: 'carbon' | 'greenDark'): string {
  return state === 'completed' ? mapColors.routeCompleted : visualTokens.colors[activeTone];
}

export function locationColor(context: 'blue' | 'green'): string {
  return visualTokens.colors[context];
}
