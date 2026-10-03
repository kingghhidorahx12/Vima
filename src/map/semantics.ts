import { resolveColor, visualTokens } from '../design/tokens/index.ts';

export const mapColors = {
  origin: resolveColor(visualTokens.mapSemantics.origin),
  destination: resolveColor(visualTokens.mapSemantics.destination),
  routeCompleted: resolveColor(visualTokens.mapSemantics.routeCompleted),
  communication: resolveColor(visualTokens.mapSemantics.communicationAction),
  wait: resolveColor(visualTokens.mapSemantics.waitWarning),
};

/** Passenger routes use accentBlue; legacy contexts remain explicit. */
export function routeColor(state: 'active' | 'completed', activeTone: 'carbon' | 'greenDark' | 'accentBlue'): string {
  return state === 'completed' ? mapColors.routeCompleted : visualTokens.colors[activeTone];
}

export function locationColor(context: 'blue' | 'green'): string {
  return visualTokens.colors[context];
}
