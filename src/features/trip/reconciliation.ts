import { CancelledError } from '@tanstack/react-query';
import { matchingDevTrace, type MatchingTrace } from '../../services/matching/devTrace.ts';
import { reconcileTrip, validateTrip, type AuthoritativeTrip } from './contracts.ts';

export type TripReconcileOrigin = 'query_structural_sharing' | 'request_receipt' | 'command_receipt' |
  'active_request_seed' | 'active_request_conflict_recovery';
export interface TripFenceContext { readonly epoch: number; readonly isCurrent: () => boolean }
export function assertCurrentTrip(context?: TripFenceContext) {
  if (context && !context.isCurrent()) throw new CancelledError({ silent: true });
}
/** Diagnostics never weaken identity validation, including the query key's expected ID. */
export function reconcileTripWithContext(previous: AuthoritativeTrip | undefined, incoming: AuthoritativeTrip,
  context: { origin: TripReconcileOrigin; expectedId: string; epoch?: number; trace?: MatchingTrace }) {
  (context.trace ?? matchingDevTrace)('trip_reconcile', { origin: context.origin, previousId: previous?.id,
    incomingId: incoming.id, expectedId: context.expectedId, queryKey: JSON.stringify(['trip', context.expectedId]),
    epoch: context.epoch, previousRevision: previous?.revision, incomingRevision: incoming.revision });
  validateTrip(incoming, context.expectedId);
  if (previous) validateTrip(previous, context.expectedId);
  return reconcileTrip(previous, incoming);
}
