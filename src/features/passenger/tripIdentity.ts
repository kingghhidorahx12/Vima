import type { QueryClient } from '@tanstack/react-query';
import { connectTripRealtime, type RealtimeTransport } from '../../services/realtime/index.ts';
import type { MatchingTrace } from '../../services/matching/devTrace.ts';
import { tripKey } from '../trip/queries.ts';
import { reconcileTripWithContext, type TripReconcileOrigin, type TripFenceContext } from '../trip/reconciliation.ts';
import { passengerTrip, type PassengerTrip } from './model.ts';

export type TripIdentityOrigin = Exclude<TripReconcileOrigin, 'query_structural_sharing' | 'command_receipt'> | 'release_terminal';
export interface IdentityFence { readonly epoch: number; readonly expectedTripId: string | undefined }
const terminal = (trip: PassengerTrip | undefined) => !!trip && ['cancelled', 'expired', 'completed'].includes(trip.phase);

/** One synchronous authority owned by the hook; async callers retain immutable fences. */
export function createPassengerIdentity(client: QueryClient, transport: RealtimeTransport,
  onIdentity: (id: string | undefined) => void, trace?: MatchingTrace) {
  const identityEpoch = { current: 0 };
  const currentTripId = { current: undefined as string | undefined };
  const realtimeStop = { current: undefined as (() => void) | undefined };
  let mounted = true;
  const capture = (): IdentityFence => ({ epoch: identityEpoch.current, expectedTripId: currentTripId.current });
  const isCurrent = (fence: IdentityFence) => mounted && fence.epoch === identityEpoch.current && fence.expectedTripId === currentTripId.current;
  const context = (fence = capture()): TripFenceContext => ({ epoch: fence.epoch, isCurrent: () => isCurrent(fence) });
  const stop = () => { realtimeStop.current?.(); realtimeStop.current = undefined; };
  const start = () => {
    if (!mounted || !currentTripId.current || realtimeStop.current) return;
    const fence = capture();
    realtimeStop.current = connectTripRealtime(client, transport, currentTripId.current, () => isCurrent(fence));
  };
  function adoptTripIdentity(incoming: PassengerTrip | null, origin: TripIdentityOrigin, fence: IdentityFence) {
    if (!isCurrent(fence)) return undefined;
    if (!incoming && origin !== 'release_terminal') return null; // A null /active never erases local authority.
    const previousId = currentTripId.current;
    const nextId = incoming?.id;
    if (previousId && previousId !== nextId && !terminal(client.getQueryData<PassengerTrip>(tripKey(previousId))))
      throw new Error('active_request_identity_violation');
    let confirmed: PassengerTrip | undefined;
    if (incoming) {
      if (origin === 'release_terminal') throw new Error('invalid_identity_origin');
      confirmed = passengerTrip(reconcileTripWithContext(client.getQueryData<PassengerTrip>(tripKey(incoming.id)), incoming,
        { origin, expectedId: incoming.id, epoch: fence.epoch, trace }));
      if (origin !== 'request_receipt' && !['searching', 'reassigning', 'assigned'].includes(incoming.phase)) throw new Error('invalid_active_request');
    }
    if (previousId !== nextId) {
      identityEpoch.current++; // Fence callbacks before stop/cancel can flush them.
      stop();
      if (previousId) void client.cancelQueries({ queryKey: tripKey(previousId), exact: true });
    }
    if (confirmed) client.setQueryData(tripKey(confirmed.id), confirmed);
    currentTripId.current = nextId;
    onIdentity(nextId);
    start();
    return confirmed ?? null;
  }
  return { capture, isCurrent, context, adoptTripIdentity,
    resume() { mounted = true; start(); },
    dispose() {
      mounted = false; identityEpoch.current++; stop();
      if (currentTripId.current) void client.cancelQueries({ queryKey: tripKey(currentTripId.current), exact: true });
    } };
}
