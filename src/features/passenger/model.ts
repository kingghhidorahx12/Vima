import type { TripLifecycle } from '../../services/matching/lifecycle.ts';
import type { RequestState } from '../../services/matching/contracts.ts';
import type { Coordinate, VehicleSample } from '../../map/vehicleMotion.ts';
import type { RouteFeature } from '../../map/routeGeometry.ts';
import type { RealtimeTransport } from '../../services/realtime/index';
import type { AuthoritativeTrip, TripGateway, TripRequestContext } from '../trip/contracts.ts';
import type { PlaceSuggestion } from '../../services/geospatial/contracts.ts';
import type { QuoteResponse } from '../../services/pricing/contracts.ts';
import type { PlaceImageRef, PlaceMediaResolver } from '../../services/geospatial/placeMedia.ts';
import type { SavedSlot } from '../../services/geospatial/personalPlaces.ts';

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly coordinate: Coordinate;
  readonly canonicalId?: string;
  readonly regionId?: string;
  readonly category?: string;
  readonly image?: PlaceImageRef;
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
  readonly pricing?: QuoteResponse;
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
  readonly phase: MatchingPhase | 'assigned' | 'cancelled' | 'expired' | 'completed';
  /** Authoritative search window; adapters must enforce the configured deadline. */
  readonly searchStartedAt?: number;
  readonly searchDeadlineAt?: number;
  readonly quote: RideQuote;
  readonly requestState?: RequestState; readonly lifecycle?: TripLifecycle;
  readonly assignment?: Assignment;
}
export type PassengerPhase = 'home' | 'confirm' | 'requesting' | PassengerTrip['phase'];
export type Connection = 'online' | 'offline' | 'reconnecting';

/** Internal UI adapter, not a declaration of backend endpoints or cancellation rules. */
export interface PassengerGateway extends TripGateway, RealtimeTransport {
  activeRequest?(signal?: AbortSignal, context?: TripRequestContext): Promise<PassengerTrip | null>;
  readonly scope: string;
  readonly source: 'server' | 'fixture';
  readonly paymentReady?: boolean;
  readonly tripRequestAvailable?: boolean;
  readonly resolvePlaceMedia?: PlaceMediaResolver;
  locate(signal?: AbortSignal): Promise<Place | null>;
  recentPlaces(signal?: AbortSignal): Promise<readonly Place[]>;
  favoritePlaces?(signal?: AbortSignal): Promise<readonly Place[]>;
  saveFavorite?(place: Place): Promise<void>;
  removeFavorite?(canonicalId: string): Promise<void>;
  recordConfirmedDestination?(place: Place): Promise<void>;
  savedSlots?(signal?: AbortSignal): Promise<{ home: Place | null; work: Place | null }>;
  saveSavedSlot?(slot: SavedSlot, place: Place): Promise<void>;
  removeSavedSlot?(slot: SavedSlot): Promise<void>;
  findPlaces(query: string, signal?: AbortSignal): Promise<readonly Place[]>;
  suggestPlaces?(query: string, signal?: AbortSignal, bias?: Coordinate): Promise<readonly PlaceSuggestion[]>;
  searchPlaces?(query: string, signal?: AbortSignal, bias?: Coordinate): Promise<readonly PlaceSuggestion[]>;
  followPlaceAction?(id: string, signal?: AbortSignal, bias?: Coordinate): Promise<readonly PlaceSuggestion[]>;
  resolvePlace?(id: string, signal?: AbortSignal): Promise<Place>;
  reversePlace?(coordinate: Coordinate, signal?: AbortSignal): Promise<Place | null>;
  contributePlace?(input: { name: string; coordinate: Coordinate; reference?: string }, idempotencyKey: string,
    signal?: AbortSignal): Promise<Place>;
  discoverPlaces?(regionId: string, signal?: AbortSignal): Promise<{ popular: readonly PlaceSuggestion[];
    featured: readonly PlaceSuggestion[] }>;
  sendPlaceSignal?(type: 'place_selected' | 'destination_confirmed', place: Place): Promise<void>;
  closePlaces?(): void;
  quote(draft: RideDraft, signal?: AbortSignal, operationId?: string): Promise<RideQuote>;
  /** Editing/scheduling must confirm cancellation of the active request before a new request. */
  request(quote: RideQuote, requestId: string, context?: TripRequestContext): Promise<PassengerTrip>;
  fetch(tripId: string, signal?: AbortSignal, context?: TripRequestContext): Promise<PassengerTrip>;
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
  if (!['searching', 'expanding', 'prolonged', 'reassigning', 'assigned', 'cancelled', 'expired', 'completed'].includes(value.phase) || !value.quote ||
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
export function quoteGates(quote: RideQuote | undefined, gateway?: Pick<PassengerGateway, 'source' | 'paymentReady' | 'tripRequestAvailable'>, now = Date.now()) {
  const pricingReady = quote?.pricing ? quote.pricing.status === 'priced' && quote.pricing.quote.expiresAt > now : !!quote?.price;
  return { pricingReady, paymentReady: gateway?.source === 'server' ? gateway.paymentReady === true : !!quote?.paymentMethod,
    tripRequestAvailable: gateway?.source === 'server' ? gateway.tripRequestAvailable === true : true };
}
export function canRequest(quote: RideQuote | undefined, connection: Connection, pending: boolean,
  gateway?: Pick<PassengerGateway, 'source' | 'paymentReady' | 'tripRequestAvailable'>): boolean {
  const gates = quoteGates(quote, gateway);
  return gates.pricingReady && gates.paymentReady && gates.tripRequestAvailable && !!quote &&
    validDraft(quote.origin, quote.destination) && connection === 'online' && !pending;
}
export function passengerTitle(phase: PassengerPhase): string {
  if (phase === 'assigned') return 'Tu conductor va en camino';
  if (isMatching(phase)) return 'Buscando un conductor';
  if (phase === 'confirm' || phase === 'requesting') return 'Confirma tu viaje';
  return 'Vima';
}
