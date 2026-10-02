import type { PassengerGateway } from '../../features/passenger/model.ts';
import type { GeospatialClient } from './client.ts';
import { GeospatialError } from './contracts.ts';
import { createPlaceSearch } from './search.ts';
import { geospatialClientConfig } from './config.ts';
import type { PersonalPlacesRepository, SavedPlace } from './personalPlaces.ts';

const toPlace = (place: SavedPlace) => ({ ...place, id: place.canonicalId });

/** Geospatial-only P0: never fabricates pricing, payment, matching or recent trips. */
export function createPassengerLiveGateway(client: GeospatialClient, locate: PassengerGateway['locate'],
  personal?: PersonalPlacesRepository, installationId?: () => Promise<string>): PassengerGateway {
  const search = createPlaceSearch(client, geospatialClientConfig.debounceMs);
  const unavailable = async (): Promise<never> => { throw new Error('Servicio no disponible'); };
  return {
    scope: 'vima-geospatial-live', source: 'server', locate,
    recentPlaces: async () => (await personal?.recents() ?? []).map(toPlace),
    favoritePlaces: async () => (await personal?.favorites() ?? []).map(toPlace),
    saveFavorite: personal ? place => personal.saveFavorite(place) : undefined,
    removeFavorite: personal ? id => personal.removeFavorite(id) : undefined,
    recordConfirmedDestination: personal ? place => personal.recordConfirmedDestination(place) : undefined,
    suggestPlaces: search.suggest, searchPlaces: search.search, followPlaceAction: search.followUp,
    resolvePlace: search.resolve, closePlaces: search.close,
    reversePlace: client.reverseGeocode,
    contributePlace: async (input, key, signal) => (await client.contributePlace(input, key, signal)).place,
    discoverPlaces: client.discovery,
    sendPlaceSignal: installationId ? async (type, place) => {
      const canonicalPlaceId = place.canonicalId ?? place.id;
      if (!place.regionId || !/^(vima-local:|tomtom:)/.test(canonicalPlaceId)) return;
      const eventId = `signal-${Date.now()}-${Math.floor(Math.random() * 0x1_0000_0000).toString(16)}`;
      await client.signalPlace({ eventId, type, canonicalPlaceId, regionId: place.regionId,
        occurredAt: Date.now(), installationId: await installationId() });
    } : undefined,
    async findPlaces(query, signal) {
      const result = await client.geocode(query, signal);
      return result ? [result] : [];
    },
    async quote(draft, signal) {
      const route = await client.route({ origin: draft.origin.coordinate, destination: draft.destination.coordinate,
        stops: draft.stops.map(place => place.coordinate) }, signal);
      if (!route.geometry) throw new GeospatialError('invalid_result');
      return { ...draft, id: `route-preview:${draft.origin.id}:${draft.destination.id}`, route: route.geometry,
        durationMinutes: Math.ceil((route.trafficDurationSeconds ?? route.durationSeconds) / 60),
        distanceKm: Math.round(route.distanceMeters / 100) / 10 };
    },
    request: unavailable, fetch: unavailable, execute: unavailable,
    getConnection: () => 'online', subscribeConnection: () => () => {}, subscribeTrip: () => () => {},
  };
}
