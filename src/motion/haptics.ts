import * as Haptics from 'expo-haptics';
import { hapticForEvent, type HapticEvent, type SemanticHaptic } from './hapticEvents';
import { motionTokens } from './tokens';

export type HapticEffect =
  | { kind: 'selection' }
  | { kind: 'impact'; style: Haptics.ImpactFeedbackStyle }
  | { kind: 'notification'; type: Haptics.NotificationFeedbackType };

/** All calls stay here; haptics cannot confirm server-authoritative outcomes. */
export function createSemanticHaptics<Event extends string>(
  events: Readonly<Record<Event, HapticEffect>>,
  enabled: () => boolean = () => true,
) {
  return async (event: Event): Promise<boolean> => {
    if (!enabled()) return false;
    const effect = events[event];
    try {
      switch (effect.kind) {
        case 'selection': await Haptics.selectionAsync(); break;
        case 'impact': await Haptics.impactAsync(effect.style); break;
        case 'notification': await Haptics.notificationAsync(effect.type); break;
      }
      return true;
    } catch {
      // Haptics are best effort and can never confirm a critical action.
      return false;
    }
  };
}

const effects: Readonly<Record<SemanticHaptic, HapticEffect>> = {
  light: { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Light },
  medium: { kind: 'impact', style: Haptics.ImpactFeedbackStyle.Medium },
  success: { kind: 'notification', type: Haptics.NotificationFeedbackType.Success },
  error: { kind: 'notification', type: Haptics.NotificationFeedbackType.Error },
  warning: { kind: 'notification', type: Haptics.NotificationFeedbackType.Warning },
};
const events = Object.fromEntries(
  (Object.keys(motionTokens.haptics) as HapticEvent[]).map((event) => [event, effects[hapticForEvent(event)]]),
) as Readonly<Record<HapticEvent, HapticEffect>>;

export const semanticHaptics = createSemanticHaptics(events);
