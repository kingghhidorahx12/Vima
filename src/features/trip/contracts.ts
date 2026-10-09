/** Phase names and command schemas belong to the eventual backend contract. */
export interface AuthoritativeTrip {
  readonly id: string;
  readonly revision: number;
  readonly phase: string;
}

export interface TripCommand {
  readonly tripId: string;
  readonly commandId: string;
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TripRequestContext {
  readonly epoch?: number;
  readonly expectedId?: string;
}

export interface TripGateway {
  fetch(tripId: string, signal?: AbortSignal, context?: TripRequestContext): Promise<AuthoritativeTrip>;
  /** Resolve only after the server confirms the resulting trip state. */
  execute(command: TripCommand, context?: TripRequestContext): Promise<AuthoritativeTrip>;
}

export function validateTrip(trip: AuthoritativeTrip, expectedId: string): AuthoritativeTrip {
  if (typeof trip.id !== 'string' || !trip.id || trip.id !== expectedId ||
      !Number.isSafeInteger(trip.revision) || trip.revision < 0 || typeof trip.phase !== 'string' || !trip.phase) {
    throw new Error('Invalid authoritative trip response');
  }
  return trip;
}

export function reconcileTrip(previous: AuthoritativeTrip | undefined, incoming: AuthoritativeTrip) {
  validateTrip(incoming, incoming.id);
  if (previous && previous.id !== incoming.id) throw new Error('Cannot reconcile different trips');
  return previous && previous.revision >= incoming.revision ? previous : incoming;
}
