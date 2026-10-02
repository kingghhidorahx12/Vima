import type { Coordinate, VehicleSample } from '../../map/vehicleMotion.ts';
import type { RouteFeature } from '../../map/routeGeometry.ts';
import type { RealtimeTransport } from '../../services/realtime/index';
import type { AuthoritativeTrip, TripGateway } from '../trip/contracts.ts';
import type { PlaceSuggestion } from '../../services/geospatial/contracts.ts';

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly coordinate: Coordinate;
}
export interface RideDraft { readonly origin: Place; readonly destination: Place; readonly stops: readonly Place[] }
export interface RideQuote extends RideDraft {
  readonly id: string;
  readonly route: RouteFeature;
  readonly durationMinutes: number;
  readonly distanceKm: number;
  /** Absent for a route preview until an authoritative pricing backend exists. */
  readonly price?: { readonly amount: number; readonly currency: string };
  readonly paymentMethod?: string;
}
export interface Assignment {
  readonly id: string;
  readonly driver: { readonly name: string; readonly rating: number };
  readonly vehicle: { readonly name: string; readonly plate: string; readonly color: string };
  readonly etaMinutes: number;
  readonly pin: string;
  readonly sample: VehicleSample;
  readonly routeToOrigin: RouteFeature;
}
export type MatchingPhase = 'searching' | 'expanding' | 'prolonged' | 'reassigning';
export type OriginStatus = 'loading' | 'automatic' | 'manual' | 'unavailable';
export interface PassengerTrip extends AuthoritativeTrip {
  readonly phase: MatchingPhase | 'assigned' | 'cancelled' | 'expired';
  /** Authoritative search window; adapters must enforce the configured deadline. */
  readonly searchStartedAt?: number;
  readonly searchDeadlineAt?: number;
  readonly quote: RideQuote;
  readonly assignment?: Assignment;
}
export type PassengerPhase = 'home' | 'confirm' | 'requesting' | PassengerTrip['phase'];
export type Connection = 'online' | 'offline' | 'reconnecting';

/** Internal UI adapter, not a declaration of backend endpoints or cancellation rules. */
export interface PassengerGateway extends TripGateway, RealtimeTransport {
  readonly scope: string;
  readonly source: 'server' | 'fixture';
  locate(signal?: AbortSignal): Promise<Place | null>;
  recentPlaces(signal?: AbortSignal): Promise<readonly Place[]>;
  findPlaces(query: string, signal?: AbortSignal): Promise<readonly Place[]>;
  suggestPlaces?(query: string, signal?: AbortSignal, bias?: Coordinate): Promise<readonly PlaceSuggestion[]>;
  searchPlaces?(query: string, signal?: AbortSignal, bias?: Coordinate): Promise<readonly PlaceSuggestion[]>;
  followPlaceAction?(id: string, signal?: AbortSignal, bias?: Coordinate): Promise<readonly PlaceSuggestion[]>;
  resolvePlace?(id: string, signal?: AbortSignal): Promise<Place>;
  closePlaces?(): void;
  quote(draft: RideDraft, signal?: AbortSignal): Promise<RideQuote>;
  /** Editing/scheduling must confirm cancellation of the active request before a new request. */
  request(quote: RideQuote, requestId: string): Promise<PassengerTrip>;
  fetch(tripId: string, signal?: AbortSignal): Promise<PassengerTrip>;
  getConnection(): Connection;
  subscribeConnection(listener: () => void): () => void;
}

export function validPlace(place: Place | null | undefined): place is Place {
  return !!place && !!place.id && !!place.name && place.coordinate.length === 2 &&
    Number.isFinite(place.coordinate[0]) && Math.abs(place.coordinate[0]) <= 180 &&
    Number.isFinite(place.coordinate[1]) && Math.abs(place.coordinate[1]) <= 90;
}
export function validDraft(origin: Place | null | undefined, destination: Place | null | undefined): boolean {
  return validPlace(origin) && validPlace(destination) && origin.id !== destination.id;
}
export function passengerTrip(trip: AuthoritativeTrip): PassengerTrip {
  const value = trip as PassengerTrip;
  if (!['searching', 'expanding', 'prolonged', 'reassigning', 'assigned', 'cancelled', 'expired'].includes(value.phase) || !value.quote ||
    (value.phase === 'assigned' && !value.assignment)) throw new Error('Unsupported passenger snapshot');
  return value;
}
export function passengerPhase(trip: PassengerTrip | undefined, editing: boolean, confirming: boolean, requesting: boolean): PassengerPhase {
  // An assignment always wins over a local edit; the passenger never accepts it.
  if (trip?.phase === 'assigned') return 'assigned';
  if (requesting) return 'requesting';
  if (trip && trip.phase !== 'cancelled' && trip.phase !== 'expired' && !editing) return trip.phase;
  return confirming ? 'confirm' : 'home';
}
export function isMatching(phase: PassengerPhase): phase is MatchingPhase {
  return phase === 'searching' || phase === 'expanding' || phase === 'prolonged' || phase === 'reassigning';
}
export function canRequest(quote: RideQuote | undefined, connection: Connection, pending: boolean): boolean {
  return !!quote?.price && !!quote.paymentMethod && validDraft(quote.origin, quote.destination) && connection === 'online' && !pending;
}
export function passengerTitle(phase: PassengerPhase): string {
  if (phase === 'assigned') return 'Tu conductor va en camino';
  if (isMatching(phase)) return 'Buscando un conductor';
  if (phase === 'confirm' || phase === 'requesting') return 'Confirma tu viaje';
  return 'Vima';
}
