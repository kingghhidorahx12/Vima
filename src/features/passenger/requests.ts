import type { QueryClient } from '@tanstack/react-query';
import { reconcileTrip, validateTrip } from '../trip/contracts.ts';
import { tripKey } from '../trip/queries.ts';
import { passengerTrip, type PassengerGateway, type PassengerTrip, type RideQuote } from './model.ts';

/** No onMutate/optimistic matching: cache changes only after the adapter confirms. */
export async function requestPassengerRide(client: QueryClient, gateway: PassengerGateway, quote: RideQuote, requestId: string) {
  const response = await gateway.request(quote, requestId);
  const confirmed = passengerTrip(validateTrip(response, response.id));
  client.setQueryData<PassengerTrip>(tripKey(confirmed.id), (old) => reconcileTrip(old, confirmed) as PassengerTrip);
  return confirmed;
}
