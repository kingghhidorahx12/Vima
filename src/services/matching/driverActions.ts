import { ApiError } from '../api/client.ts';
import type { MatchingClient } from './client.ts';
import type { DriverState } from './contracts.ts';
import { matchingDevTrace, type MatchingTrace } from './devTrace.ts';
import { driverOperationId } from './operationId.ts';

export type DriverActionIntent =
  | Readonly<{ kind: 'availability_available' | 'availability_offline' }>
  | Readonly<{ kind: 'offer_accept' | 'offer_reject'; offerId: string; requestId: string }>
  | Readonly<{ kind: 'assignment_cancel'; requestId: string; assignmentId: string }>;
export interface PendingDriverAction { readonly intent: DriverActionIntent; readonly operationId: string }
type ActionClient = Pick<MatchingClient, 'availability' | 'offerAction' | 'cancelAssignment'>;

export function driverActionApplies(intent: DriverActionIntent, state: DriverState | undefined, now: number) {
  if (!state) return false;
  switch (intent.kind) {
    case 'assignment_cancel': return state.assignment?.requestId === intent.requestId && state.assignment.value.id === intent.assignmentId && ['ASSIGNED', 'ARRIVED_PICKUP'].includes(state.assignment.state);
    case 'offer_accept': case 'offer_reject': return state.offer?.id === intent.offerId && state.offer.requestId === intent.requestId &&
      state.offer.expiresAt > now && state.availability === 'AVAILABLE';
    case 'availability_available': return !state.assignment && ['OFFLINE', 'PAUSED'].includes(state.availability);
    case 'availability_offline': return !state.assignment && state.availability !== 'OFFLINE';
  }
}

/** Ref-backed UI intent authority. No stored closures or target lookup on retry. */
export function createDriverActions(client: ActionClient, options: {
  changed: () => void; received: (state: DriverState) => void; settled: () => void;
  error: (message: string) => void; trace?: MatchingTrace; now?: () => number;
}) {
  const pending = { current: undefined as PendingDriverAction | undefined };
  const inFlight = { current: false };
  let state: DriverState | undefined; let mounted = true;
  const now = options.now ?? Date.now; const trace = options.trace ?? matchingDevTrace;
  const applicable = (value: PendingDriverAction) => driverActionApplies(value.intent, state, now());
  function receive(snapshot: DriverState) {
    if (!mounted || state && snapshot.revision < state.revision) return;
    state = snapshot;
    if (pending.current && !applicable(pending.current)) { pending.current = undefined; options.changed(); }
  }
  async function dispatch(value: PendingDriverAction) {
    if (!mounted || inFlight.current || pending.current !== value) return;
    if (!applicable(value)) { pending.current = undefined; options.changed(); return; }
    inFlight.current = true; options.error(''); options.changed();
    const { intent, operationId } = value;
    trace('driver_action_request', { intent: intent.kind, operationId,
      requestId: 'requestId' in intent ? intent.requestId : undefined, offerId: 'offerId' in intent ? intent.offerId : undefined });
    try {
      let snapshot: DriverState;
      switch (intent.kind) {
        case 'availability_available': snapshot = await client.availability('AVAILABLE', operationId); break;
        case 'availability_offline': snapshot = await client.availability('OFFLINE', operationId); break;
        case 'offer_accept': case 'offer_reject': snapshot = await client.offerAction(intent.offerId, intent.kind === 'offer_accept' ? 'accept' : 'reject', operationId); break;
        case 'assignment_cancel': snapshot = await client.cancelAssignment(intent.requestId, operationId, intent.assignmentId); break;
      }
      if (!mounted) return;
      receive(snapshot); options.received(snapshot);
      if (pending.current === value) pending.current = undefined;
    } catch (error) {
      if (!mounted || pending.current !== value) return;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        pending.current = undefined; options.error('La acción ya no está disponible. Se actualizará el estado.');
      } else if (applicable(value)) options.error('Acción sin confirmar. Reintenta para reconciliar el mismo intento.');
      else pending.current = undefined;
    } finally {
      inFlight.current = false;
      if (mounted) { options.changed(); options.settled(); }
    }
  }
  return {
    pending, inFlight, receive,
    startDriverAction(input: DriverActionIntent) {
      if (!mounted || pending.current || inFlight.current || !driverActionApplies(input, state, now())) return;
      const value = Object.freeze({ intent: Object.freeze({ ...input }), operationId: driverOperationId(input.kind) });
      pending.current = value; // Synchronous, before observers/await: a second press cannot enter.
      trace('driver_action_press', { intent: value.intent.kind, operationId: value.operationId,
        requestId: 'requestId' in value.intent ? value.intent.requestId : undefined, offerId: 'offerId' in value.intent ? value.intent.offerId : undefined });
      return dispatch(value);
    },
    retryPendingDriverAction() { if (pending.current) return dispatch(pending.current); },
    resume() { mounted = true; },
    dispose() { mounted = false; pending.current = undefined; },
  };
}
