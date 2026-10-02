import { motionTokens } from './tokens.ts';

export type HapticEvent = keyof typeof motionTokens.haptics;
export type SemanticHaptic = 'light' | 'medium' | 'success' | 'error' | 'warning';
export function hapticForEvent(event: HapticEvent): SemanticHaptic {
  const effect = motionTokens.haptics[event];
  if (effect !== 'light' && effect !== 'medium' && effect !== 'success' && effect !== 'error' && effect !== 'warning') {
    throw new Error(`Unsupported approved haptic: ${effect}`);
  }
  return effect;
}
