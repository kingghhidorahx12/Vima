import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { reconcileTrip, validateTrip, type AuthoritativeTrip, type TripCommand, type TripGateway } from './contracts.ts';

export const tripKey = (tripId: string) => ['trip', tripId] as const;

export function tripQueryOptions(gateway: TripGateway, tripId: string) {
  return queryOptions({
    queryKey: tripKey(tripId),
    queryFn: async ({ signal }) => validateTrip(await gateway.fetch(tripId, signal), tripId),
    // Prevent an older HTTP response from overwriting a newer confirmed revision.
    structuralSharing: (oldData, newData) => reconcileTrip(oldData as AuthoritativeTrip | undefined, newData as AuthoritativeTrip),
  });
}

export async function executeConfirmedCommand(client: QueryClient, gateway: TripGateway, command: TripCommand) {
  const confirmed = validateTrip(await gateway.execute(command), command.tripId);
  client.setQueryData<AuthoritativeTrip>(tripKey(command.tripId), (previous) => reconcileTrip(previous, confirmed));
  return confirmed;
}

export function useCriticalTripCommand(gateway: TripGateway) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: TripCommand) => executeConfirmedCommand(client, gateway, command),
    retry: false,
    // A transport failure can be ambiguous: reconcile; never pretend it succeeded.
    onSettled: (_data, _error, command) => client.invalidateQueries({ queryKey: tripKey(command.tripId) }),
  });
}
