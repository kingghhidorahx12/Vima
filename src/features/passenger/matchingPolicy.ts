/** P0 search policy, independent from animation and fixture transport delays. */
export interface MatchingPolicy { readonly lateAfterMs: number; readonly prolongedAfterMs: number; readonly limitMs: number }
export const matchingPolicy: MatchingPolicy = Object.freeze({ lateAfterMs: 60_000, prolongedAfterMs: 120_000, limitMs: 15 * 60_000 });
export function matchingPhaseAt(elapsedMs: number, policy: MatchingPolicy = matchingPolicy) {
  if (elapsedMs >= policy.limitMs) return 'expired';
  if (elapsedMs >= policy.prolongedAfterMs) return 'prolonged';
  if (elapsedMs >= policy.lateAfterMs) return 'expanding';
  return 'searching';
}
