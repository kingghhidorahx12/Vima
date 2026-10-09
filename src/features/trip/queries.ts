import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { type AuthoritativeTrip, type TripCommand, type TripGateway } from './contracts.ts';
import { assertCurrentTrip, reconcileTripWithContext, type TripFenceContext } from './reconciliation.ts';

export const tripKey = (tripId: string) => ['trip', tripId] as const;

export function tripQueryOptions(gateway: TripGateway, tripId: string, context?: TripFenceContext) {
  return queryOptions({
    queryKey: tripKey(tripId),
    queryFn: async ({ signal }) => {
      assertCurrentTrip(context);
      const incoming = await gateway.fetch(tripId, signal, { epoch: context?.epoch, expectedId: tripId });
      assertCurrentTrip(context);
      return reconcileTripWithContext(undefined, incoming, { origin: 'query_structural_sharing', expectedId: tripId, epoch: context?.epoch });
    },
    // Prevent an older HTTP response from overwriting a newer confirmed revision.
    structuralSharing: (oldData, newData) => reconcileTripWithContext(oldData as AuthoritativeTrip | undefined, newData as AuthoritativeTrip,
      { origin: 'query_structural_sharing', expectedId: tripId, epoch: context?.epoch }),
  });
}

export async function executeConfirmedCommand(client: QueryClient, gateway: TripGateway, command: TripCommand, context?: TripFenceContext) {
  assertCurrentTrip(context);
  const confirmed = await gateway.execute(command, { epoch: context?.epoch, expectedId: command.tripId });
  assertCurrentTrip(context);
  client.setQueryData<AuthoritativeTrip>(tripKey(command.tripId), (previous) => reconcileTripWithContext(previous, confirmed,
    { origin: 'command_receipt', expectedId: command.tripId, epoch: context?.epoch }));
  return confirmed;
}

export function useCriticalTripCommand(gateway: TripGateway) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reconciliation, ...command }: TripCommand & { reconciliation?: TripFenceContext }) => executeConfirmedCommand(client, gateway, command, reconciliation),
    retry: false,
    // A transport failure can be ambiguous: reconcile; never pretend it succeeded.
    onSettled: (_data, _error, command) => {
      if (!command.reconciliation || command.reconciliation.isCurrent())
        return client.invalidateQueries({ queryKey: tripKey(command.tripId), exact: true });
    },
  });
}
