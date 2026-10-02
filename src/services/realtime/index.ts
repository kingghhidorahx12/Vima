import type { QueryClient } from '@tanstack/react-query';
import { tripKey } from '../../features/trip/queries';

export interface TripInvalidation {
  readonly tripId: string;
}

export interface RealtimeTransport {
  subscribeTrip(tripId: string, onChange: (event: TripInvalidation) => void, onReconnect: () => void): () => void;
}

/** Transport messages trigger authoritative reads, not local success or phase writes. */
export function connectTripRealtime(client: QueryClient, transport: RealtimeTransport, tripId: string) {
  const reconcile = () => { void client.invalidateQueries({ queryKey: tripKey(tripId) }); };
  return transport.subscribeTrip(tripId, (event) => {
    if (event.tripId === tripId) reconcile();
  }, reconcile);
}
