import type { QueryClient } from '@tanstack/react-query';
import { tripKey } from '../../features/trip/queries.ts';

export interface TripInvalidation {
  readonly tripId: string;
}

export interface RealtimeTransport {
  subscribeTrip(tripId: string, onChange: (event: TripInvalidation) => void, onReconnect: () => void): () => void;
}

/** Transport messages trigger authoritative reads, not local success or phase writes. */
export function connectTripRealtime(client: QueryClient, transport: RealtimeTransport, tripId: string, isCurrent: () => boolean = () => true) {
  const reconcile = () => { if (isCurrent()) void client.invalidateQueries({ queryKey: tripKey(tripId), exact: true }); };
  return transport.subscribeTrip(tripId, (event) => {
    if (event.tripId === tripId) reconcile();
  }, reconcile);
}
