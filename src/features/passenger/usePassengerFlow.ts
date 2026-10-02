import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { connectTripRealtime } from '../../services/realtime';
import { useCriticalTripCommand, tripKey, tripQueryOptions } from '../trip/queries';
import { canRequest, isMatching, passengerPhase, passengerTrip, validDraft, type OriginStatus, type PassengerGateway, type PassengerTrip, type Place, type RideQuote } from './model';
import { requestPassengerRide } from './requests';
import type { PlaceSuggestion } from '../../services/geospatial/contracts';
import { approvedLocalPlaces } from '../../services/geospatial/localPlaces';
import { createSearchCoordinator } from '../../services/geospatial/searchCoordinator';
import { geospatialClientConfig } from '../../services/geospatial/config';
import { isGeographicQuery } from '../../services/geospatial/regionalRanking';

let operationSequence = 0;
function operationId() { return `passenger-${Date.now()}-${++operationSequence}`; }

export function usePassengerFlow(gateway: PassengerGateway) {
  const client = useQueryClient();
  const connection = useSyncExternalStore(gateway.subscribeConnection, gateway.getConnection, gateway.getConnection);
  const [originChoice, setOrigin] = useState<{ place: Place; kind: 'automatic' | 'manual' }>();
  const [destination, setDestination] = useState<Place | null>(null);
  const [stops, setStops] = useState<readonly Place[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tripId, setTripId] = useState<string>();
  const [field, setField] = useState<'origin' | 'destination' | null>(null);
  const [search, setSearch] = useState('');
  const [searchCoordinator] = useState(() => createSearchCoordinator(approvedLocalPlaces));
  const [followUpResults, setFollowUpResults] = useState<{ query: string; results: readonly PlaceSuggestion[] }>();
  const requestId = useRef<string | null>(null);
  const contributionRequest = useRef<{ fingerprint: string; id: string } | undefined>(undefined);
  const locked = useRef(false);
  const selection = useRef<AbortController | undefined>(undefined);
  const [selectionError, setSelectionError] = useState<Error>();
  const [resolving, setResolving] = useState(false);
  const location = useQuery({ queryKey: ['passenger', gateway.scope, 'location'], queryFn: ({ signal }) => gateway.locate(signal), retry: false,
    staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const recents = useQuery({ queryKey: ['passenger', gateway.scope, 'recents'], queryFn: ({ signal }) => gateway.recentPlaces(signal), retry: false });
  const favorites = useQuery({ queryKey: ['passenger', gateway.scope, 'favorites'],
    queryFn: ({ signal }) => gateway.favoritePlaces?.(signal) ?? Promise.resolve([]), retry: false,
    enabled: !!gateway.favoritePlaces });
  // A late geolocation result can update its query, never an explicit selection.
  const origin = originChoice?.place ?? location.data ?? null;
  const discoveryRegion = origin?.regionId ?? 'atlacomulco';
  const discovery = useQuery({ queryKey: ['passenger', gateway.scope, 'discovery', discoveryRegion],
    queryFn: ({ signal }) => gateway.discoverPlaces?.(discoveryRegion, signal) ?? Promise.resolve({ popular: [], featured: [] }),
    enabled: field !== null && !search.trim() && !!gateway.discoverPlaces, retry: false, staleTime: 60_000 });
  const places = useQuery({ queryKey: ['passenger', gateway.scope, 'places', field, search, origin?.coordinate],
    queryFn: async ({ signal }) => {
      const results = gateway.suggestPlaces ? await gateway.suggestPlaces(search, signal, origin?.coordinate)
        : await gateway.findPlaces(search, signal);
      if (!signal.aborted) searchCoordinator.remember(search, results);
      return results;
    }, enabled: field !== null && search.trim().length > 0, retry: false, gcTime: 0, staleTime: 0,
    placeholderData: previous => previous });
  const geography = useQuery({ queryKey: ['passenger', gateway.scope, 'geography', field, search, origin?.coordinate],
    queryFn: async ({ signal }) => gateway.findPlaces(search, signal),
    enabled: field !== null && isGeographicQuery(search), retry: false, staleTime: 0 });
  useEffect(() => () => { selection.current?.abort(); gateway.closePlaces?.(); }, [gateway]);
  const cancelSelection = () => { selection.current?.abort(); selection.current = undefined; setResolving(false); setSelectionError(undefined); };
  const originStatus: OriginStatus = originChoice?.kind ?? (location.isPending ? 'loading' : location.data ? 'automatic' : 'unavailable');
  const trip = useQuery({ ...tripQueryOptions(gateway, tripId ?? ''), enabled: !!tripId && connection === 'online',
    select: passengerTrip, retry: false });
  const draftStops = trip.data?.phase === 'expired' ? trip.data.quote.stops : stops;
  const quote = useQuery({ queryKey: ['passenger', gateway.scope, 'quote', origin?.id, destination?.id, draftStops.map((stop) => stop.id)],
    queryFn: ({ signal }) => gateway.quote({ origin: origin!, destination: destination!, stops: draftStops }, signal),
    enabled: confirming && validDraft(origin, destination) && connection === 'online', retry: false });
  const refetchTrip = trip.refetch;
  useEffect(() => tripId ? connectTripRealtime(client, gateway, tripId) : undefined, [client, gateway, tripId]);
  useEffect(() => {
    if (connection === 'online' && tripId) void refetchTrip();
  }, [connection, tripId, refetchTrip]);

  const request = useMutation({ mutationFn: () => requestPassengerRide(client, gateway, quote.data!, requestId.current!), retry: false });
  const command = useCriticalTripCommand(gateway);
  const pending = request.isPending || command.isPending || resolving;
  const phase = passengerPhase(trip.data, editing, confirming, request.isPending);
  const activeQuote = phase === 'home' || phase === 'confirm' || phase === 'requesting' ? quote.data : trip.data?.quote;

  const applyPlace = (value: Place, target: 'origin' | 'destination') => {
    if (pending || isMatching(phase) || phase === 'assigned') return;
    requestId.current = null;
    if (target === 'origin') setOrigin({ place: value, kind: 'manual' }); else {
      setDestination(value);
      void gateway.sendPlaceSignal?.('place_selected', value)?.catch(() => {});
    }
    const nextOrigin = target === 'origin' ? value : origin;
    const nextDestination = target === 'destination' ? value : destination;
    setConfirming(validDraft(nextOrigin, nextDestination));
    setField(null); setSearch(''); searchCoordinator.clear();
    gateway.closePlaces?.();
  };
  const choosePlace = async (value: Place | PlaceSuggestion, target = field ?? 'destination') => {
    if (pending || isMatching(phase) || phase === 'assigned') return;
    if ('coordinate' in value) { applyPlace(value, target); return; }
    if (!gateway.resolvePlace) return;
    cancelSelection();
    const controller = new AbortController(); selection.current = controller; setResolving(true);
    try {
      if ('kind' in value && value.kind === 'action') {
        if (!gateway.followPlaceAction) throw new Error('search_unavailable');
        const results = await gateway.followPlaceAction(value.id, controller.signal, origin?.coordinate);
        if (!controller.signal.aborted) setFollowUpResults({ query: search, results });
        return;
      }
      const resolved = await gateway.resolvePlace(value.id, controller.signal);
      if (!controller.signal.aborted) applyPlace(resolved, target);
    } catch (error) {
      if (!controller.signal.aborted) setSelectionError(error instanceof Error ? error : new Error('search_unavailable'));
    } finally { if (selection.current === controller) { selection.current = undefined; setResolving(false); } }
  };
  const submitSearch = async () => {
    if (!gateway.searchPlaces || !search.trim() || pending) return;
    cancelSelection();
    const controller = new AbortController(); selection.current = controller; setResolving(true);
    try {
      const results = await gateway.searchPlaces(search, controller.signal, origin?.coordinate);
      if (!controller.signal.aborted) setFollowUpResults({ query: search, results });
    } catch (error) {
      if (!controller.signal.aborted) setSelectionError(error instanceof Error ? error : new Error('search_unavailable'));
    } finally { if (selection.current === controller) { selection.current = undefined; setResolving(false); } }
  };
  const chooseMapCoordinate = async (coordinate: Place['coordinate'], target = field ?? 'destination') => {
    if (pending || isMatching(phase) || phase === 'assigned') return;
    cancelSelection(); const controller = new AbortController(); selection.current = controller; setResolving(true);
    try {
      let resolved: Place | null = null;
      try { resolved = await gateway.reversePlace?.(coordinate, controller.signal) ?? null; }
      catch { /* The touched coordinate remains authoritative when Reverse is unavailable. */ }
      if (!controller.signal.aborted) applyPlace({ id: `manual:${coordinate.join(',')}`, name: resolved?.name || 'Ubicación en el mapa',
        address: resolved?.address ?? '', coordinate }, target);
    } finally { if (selection.current === controller) { selection.current = undefined; setResolving(false); } }
  };
  const contributePlace = async (input: { name: string; coordinate: Place['coordinate']; reference?: string }) => {
    if (!gateway.contributePlace) { setSelectionError(new Error('Agregar lugar no disponible')); return null; }
    const fingerprint = `${input.name}|${input.coordinate.join(',')}|${input.reference ?? ''}`;
    if (contributionRequest.current?.fingerprint !== fingerprint)
      contributionRequest.current = { fingerprint, id: operationId() };
    cancelSelection(); const controller = new AbortController(); selection.current = controller; setResolving(true);
    try {
      const place = await gateway.contributePlace(input, contributionRequest.current.id, controller.signal);
      if (controller.signal.aborted) return null;
      contributionRequest.current = undefined;
      return place;
    } catch { if (!controller.signal.aborted) setSelectionError(new Error('No se pudo agregar el lugar')); return null; }
    finally { if (selection.current === controller) { selection.current = undefined; setResolving(false); } }
  };
  const submit = async () => {
    if (locked.current || phase !== 'confirm' || !canRequest(quote.data, connection, pending)) return;
    locked.current = true;
    requestId.current ??= operationId(); // Keep on ambiguous failure/retry.
    try {
      const confirmed = await request.mutateAsync();
      setTripId(confirmed.id); setEditing(false); setConfirming(false);
      requestId.current = null;
    } catch { /* Retain draft, quote and request ID. Error state remains recoverable. */ }
    finally { locked.current = false; }
  };
  const preserveDraft = (previous: RideQuote | undefined) => {
    if (!previous) return;
    setOrigin({ place: previous.origin, kind: originStatus === 'manual' ? 'manual' : 'automatic' });
    setDestination(previous.destination); setStops(previous.stops);
  };
  const act = async (name: 'cancel', reason: 'user' | 'edit' | 'schedule' = 'user') => {
    if (!tripId || locked.current || pending || connection !== 'online') return;
    locked.current = true;
    try {
      await command.mutateAsync({ tripId, commandId: operationId(), name, payload: { reason } });
      // A newer assignment may have arrived while cancellation was in flight.
      const confirmed = client.getQueryData<PassengerTrip>(tripKey(tripId));
      if (confirmed?.phase !== 'cancelled' && confirmed?.phase !== 'expired') return false;
      preserveDraft(confirmed.quote);
      return true;
    }
    catch { /* No optimistic cancellation or search success. */ }
    finally { locked.current = false; }
  };
  const edit = async () => {
    if (locked.current || pending || phase === 'assigned') return false;
    if (isMatching(phase) && !await act('cancel', 'edit')) return false;
    const previous = trip.data?.quote ?? quote.data;
    preserveDraft(previous);
    setTripId(undefined);
    setEditing(true); setConfirming(false); setField(null); requestId.current = null;
    return true;
  };
  const schedule = async () => {
    if (locked.current || pending || phase === 'assigned') return;
    const previous = trip.data?.quote ?? quote.data;
    if (isMatching(phase) && !await act('cancel', 'schedule')) return;
    preserveDraft(previous); setTripId(undefined); setEditing(true); setConfirming(false); setField(null); requestId.current = null;
    return previous;
  };
  const confirmLocations = async () => {
    if (!validDraft(origin, destination)) return;
    void gateway.sendPlaceSignal?.('destination_confirmed', destination!)?.catch(() => {});
    try { if (gateway.recordConfirmedDestination) {
      await gateway.recordConfirmedDestination(destination!);
      await client.invalidateQueries({ queryKey: ['passenger', gateway.scope, 'recents'] });
    } } catch { setSelectionError(new Error('No se pudo guardar el destino reciente')); }
  };
  const saveFavorite = async (place: Place) => {
    try { await gateway.saveFavorite?.(place);
      await client.invalidateQueries({ queryKey: ['passenger', gateway.scope, 'favorites'] });
    } catch { setSelectionError(new Error('No se pudo guardar en Favoritos')); }
  };
  const removeFavorite = async (id: string) => {
    try { await gateway.removeFavorite?.(id);
      await client.invalidateQueries({ queryKey: ['passenger', gateway.scope, 'favorites'] });
    } catch { setSelectionError(new Error('No se pudo actualizar Favoritos')); }
  };
  const error = selectionError ?? request.error ?? command.error ?? trip.error ?? quote.error ?? recents.error ?? favorites.error ?? places.error;
  const visiblePlaces = search.trim() ? searchCoordinator.visible(search, favorites.data ?? [],
    [...(geography.data ?? []), ...(recents.data ?? [])],
    followUpResults?.query === search ? followUpResults.results : places.data,
    followUpResults?.query === search || !places.isPlaceholderData ? search : undefined) : [];
  return { phase, connection, origin, currentLocation: location.data ?? null, originStatus, destination, quote: activeQuote, trip: trip.data, pending,
    locationAvailable: !!location.data, field, search, setSearch: (value: string) => {
      cancelSelection(); setFollowUpResults(undefined);
      if (!value.trim()) { gateway.closePlaces?.(); searchCoordinator.clear(); }
      setSearch(value);
    },
    places: visiblePlaces, settledQuery: search.trim().length >= geospatialClientConfig.noResultMinLength &&
      !places.isFetching && !geography.isFetching && (places.isSuccess || places.isError),
    recents: recents.data ?? [], favorites: favorites.data ?? [],
    popular: discovery.data?.popular ?? [], featured: discovery.data?.featured ?? [],
    saveFavorite, removeFavorite, confirmLocations,
    loadingPlaces: !!search.trim() && (places.isFetching || resolving), loadingQuote: quote.isFetching, error,
    canSubmit: phase === 'confirm' && canRequest(quote.data, connection, pending), choosePlace, chooseMapCoordinate,
    contributePlace, submitSearch, submit, act, edit, schedule,
    returnHome: () => {
      // Back never cancels or abandons an in-flight/active ride.
      if (locked.current || request.isPending || command.isPending || isMatching(phase) || phase === 'assigned') return;
      cancelSelection(); gateway.closePlaces?.(); searchCoordinator.clear();
      setField(null); setSearch(''); setFollowUpResults(undefined);
      setDestination(null); setStops([]); setConfirming(false); setEditing(false); setTripId(undefined);
      requestId.current = null; request.reset();
    },
    openField: (target: 'origin' | 'destination') => {
      if (pending || isMatching(phase) || phase === 'assigned') return;
      cancelSelection(); gateway.closePlaces?.(); searchCoordinator.clear(); setFollowUpResults(undefined); setField(target); setSearch('');
    },
    closeField: () => { cancelSelection(); gateway.closePlaces?.(); searchCoordinator.clear(); setField(null); },
    retry: () => { cancelSelection(); request.reset(); command.reset(); void client.invalidateQueries({ queryKey: ['passenger', gateway.scope] });
      if (tripId) void trip.refetch(); },
  };
}
