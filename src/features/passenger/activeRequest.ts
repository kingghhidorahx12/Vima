import type { QueryClient } from '@tanstack/react-query';
import { reconcileTrip, validateTrip } from '../trip/contracts.ts';
import { tripKey } from '../trip/queries.ts';
import { passengerTrip, type PassengerTrip } from './model.ts';

/** Identity changes are explicit; reconciliation only ever sees the incoming trip's own cache key. */
export function seedActiveRequest(client: QueryClient, currentId: string | undefined, incoming: PassengerTrip | null) {
  if (!incoming) return null;
  const active = passengerTrip(validateTrip(incoming, incoming.id));
  if (!['searching', 'reassigning', 'assigned'].includes(active.phase)) throw new Error('invalid_active_request');
  if (currentId && currentId !== active.id) {
    const current = client.getQueryData<PassengerTrip>(tripKey(currentId));
    if (!current || !['cancelled', 'expired', 'completed'].includes(current.phase)) throw new Error('active_request_identity_violation');
  }
  return client.setQueryData<PassengerTrip>(tripKey(active.id), previous => reconcileTrip(previous, active) as PassengerTrip)!;
}
