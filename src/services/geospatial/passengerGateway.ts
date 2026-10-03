import type { PassengerGateway } from '../../features/passenger/model.ts';
import type { GeospatialClient } from './client.ts';
import { createPlaceSearch } from './search.ts';
import { geospatialClientConfig } from './config.ts';
import type { PersonalPlacesRepository, SavedPlace } from './personalPlaces.ts';
import { createPlaceMediaResolver } from './placeMedia.ts';

const toPlace = (place: SavedPlace) => ({ ...place, id: place.canonicalId });

/** Live quote authority stays in Vima gateway. Payment and ride requests remain unavailable. */
export function createPassengerLiveGateway(client: GeospatialClient, locate: PassengerGateway['locate'],
  personal?: PersonalPlacesRepository, installationId?: () => Promise<string>, mediaBaseUrl?: string): PassengerGateway {
  const search = createPlaceSearch(client, geospatialClientConfig.debounceMs);
  const unavailable = async (): Promise<never> => { throw new Error('Servicio no disponible'); };
  return {
    scope: 'vima-geospatial-live', source: 'server', locate,
    resolvePlaceMedia: mediaBaseUrl ? createPlaceMediaResolver(mediaBaseUrl) : undefined,
    paymentReady: false, tripRequestAvailable: false,
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
    async quote(draft, signal, operationId) {
      if (!operationId) throw new Error('quote_operation_required');
      const pricing = await client.quote({ ...draft, operationId }, signal);
      const snapshot = pricing.status === 'priced' ? pricing.quote : pricing.routePreview;
      const route = snapshot.route;
      return { ...draft, id: snapshot.id, pricing, route: route.geometry,
        durationMinutes: Math.ceil((route.trafficDurationSeconds ?? route.durationSeconds) / 60),
        distanceKm: Math.round(route.distanceMeters / 100) / 10 };
    },
    request: unavailable, fetch: unavailable, execute: unavailable,
    getConnection: () => 'online', subscribeConnection: () => () => {}, subscribeTrip: () => () => {},
  };
}
