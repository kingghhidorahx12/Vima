import { validateTrip } from '../trip/contracts.ts';
import { passengerTrip, type PassengerGateway, type RideQuote } from './model.ts';

/** Returns authority only. Identity adoption owns all cache/identity side effects. */
export async function requestPassengerRide(gateway: PassengerGateway, quote: RideQuote, requestId: string) {
  const response = await gateway.request(quote, requestId);
  const confirmed = passengerTrip(validateTrip(response, response.id));
  return confirmed;
}
