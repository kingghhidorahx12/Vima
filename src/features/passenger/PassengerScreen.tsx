import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, type ImageSourcePropType } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { VimaMapRef } from '../../map/VimaMap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaButton } from '../../design/components/VimaButton';
import { createRideSheetInteraction } from '../../design/components/VimaRideSheet';
import { rideSheetGeometry, type SheetSnap } from '../../design/components/rideSheetGeometry';
import { VimaText } from '../../design/primitives';
import { textStyle, interFamilies } from '../../design/typography';
import { visualTokens as t } from '../../design/tokens';
import { passengerSurfaces as surfaces, surfaceColors } from '../../design/presentation';
import { elevationStyle } from '../../design/themes/light';
import { semanticHaptics } from '../../motion/haptics';
import { SearchInputGlow, SearchPulse, useSearchCycle } from '../../motion/SearchPulse';
import { VimaLaunchSurface } from '../../motion/VimaLaunchSurface';
import { motionDistances, motionTimings } from '../../motion/timing';
import { PassengerMap, type PassengerMapConfig } from './PassengerMap';
import { PassengerRideShell } from './PassengerRideShell';
import { PassengerBottomNavigation, bottomNavigationHeight } from './PassengerBottomNavigation';
import { usePassengerRouteFit } from './usePassengerRouteFit';
import { isMatching, validDraft, type Assignment, type OriginStatus, type PassengerGateway, type Place, type RideQuote } from './model';
import { usePassengerFlow } from './usePassengerFlow';
import type { PlaceSuggestion } from '../../services/geospatial/contracts';
import { normalizeCoordinate, type Coordinate } from '../../map/models';
import { defaultTrafficLayers, displayKeyAvailable, type TrafficLayerPreferences } from '../../map/traffic';
import { mapLayerStorage } from '../../services/storage/mapLayers';
import { MapControls, LocationCTA, CenteredToast } from './MapControls';
import { MapCompass } from './MapCompass';
import { locationCtaHeight, mapControlSize } from './mapCameraFootprint';
import { useLocationVisibility } from '../../map/useLocationVisibility';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { usePressFeedback } from '../../motion/usePressFeedback';
import { PlaceThumbnail } from './PlaceThumbnail';
import { mapPersonality } from '../../motion/mapPersonality';
import { IncidentCard } from './IncidentCard';
import type { IncidentDetails } from '../../map/incidentDetails';

export interface PassengerBoundaries {
  readonly schedule: (quote: RideQuote | undefined) => void;
  readonly call: (assignment: Assignment) => void;
  readonly safety: (assignment: Assignment) => void;
  readonly vehicleImage?: ImageSourcePropType;
}
export interface PassengerScreenProps {
  readonly gateway: PassengerGateway;
  readonly mapConfig: PassengerMapConfig;
  readonly boundaries: PassengerBoundaries;
  /** Disable only when the host already applies every safe-area inset. */
  readonly inset?: boolean;
}

const confirmationPillTop = 12;
const confirmationPillHeight = 40;
const homeSearchHeight = 58;
const homeSearchGap = 10;
const homeSearchAccessoryHeight = homeSearchHeight + homeSearchGap;
const passengerPanelTopRadius = 64;

export function PassengerScreen({ gateway, mapConfig, boundaries, inset = true }: PassengerScreenProps) {
  const flow = usePassengerFlow(gateway);
  const safeArea = useSafeAreaInsets();
  const topInset = inset ? safeArea.top : 0;
  const bottomInset = inset ? safeArea.bottom : 0;
  // The map now extends behind the status bar. Shift only the safe chrome and preserve
  // the former sheet/fit coordinate frame below the old top inset and 4 dp gap.
  const topFrameShift = topInset + 4;
  const chromeBottom = 8 + 48;
  const [mapLayoutNavHeight, setMapLayoutNavHeight] = useState<number>();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [height, setHeight] = useState(0);
  const [mapWidth, setMapWidth] = useState(0);
  const [visibleSheetMeasure, setVisibleSheetMeasure] = useState<{ key: string; height: number }>();
  const nativeMap = useRef<VimaMapRef>(null);
  const homeSearchPress = usePressFeedback();
  const errorPress = usePressFeedback();
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapUserControlled, setMapUserControlled] = useState(false);
  const [homePanNeedsRecenter, setHomePanNeedsRecenter] = useState(false);
  const [mapBearing, setMapBearing] = useState(0);
  const [northRequest, setNorthRequest] = useState<number>();
  const [mapLayers, setMapLayers] = useState<TrafficLayerPreferences>(defaultTrafficLayers);
  const [layersOpen, setLayersOpen] = useState(false);
  const [incident, setIncident] = useState<IncidentDetails | null>(null);
  const [recenter, setRecenter] = useState<{ coordinate: Coordinate; sequence: number }>();
  const [routeFitRequestId, setRouteFitRequestId] = useState<number>();
  const routeFitSerial = useRef(0);
  const [recentering, setRecentering] = useState(false);
  const [centered, setCentered] = useState(false);
  const pendingCenter = useRef<Coordinate | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  useEffect(() => { if (!centered) return; const timer = setTimeout(() => setCentered(false), mapPersonality.feedbackMs); return () => clearTimeout(timer); }, [centered]);
  useEffect(() => { if (!recentering) return; const timer = setTimeout(() => { pendingCenter.current = null; setRecentering(false); }, mapPersonality.feedbackMs * 2); return () => clearTimeout(timer); }, [recentering]);
  const hasDisplayKey = displayKeyAvailable(process.env.EXPO_PUBLIC_TOMTOM_DISPLAY_KEY);
  useEffect(() => {
    let active = true;
    void mapLayerStorage.read().then((stored) => { if (active) setMapLayers(stored); });
    return () => { active = false; };
  }, []);
  const [searchAction, setSearchAction] = useState<'results' | 'map' | 'contribute-map' | 'contribute-form' | 'contribute-done'>('results');
  const [selectedCoordinate, setSelectedCoordinate] = useState<Coordinate | null>(null);
  const [contributionName, setContributionName] = useState('');
  const [contributionReference, setContributionReference] = useState('');
  const [contributedPlace, setContributedPlace] = useState<Place | null>(null);
  const [homePanel, setHomePanel] = useState<'home' | 'saved' | 'favorites' | 'recents'>('home');
  const [pulseVisible, setPulseVisible] = useState(true);
  const [reviewedDraft, setReviewedDraft] = useState<string>();
  const [contentMeasure, setContentMeasure] = useState<{ key: string; height: number }>();
  const [headerMeasure, setHeaderMeasure] = useState<{ key: string; height: number }>();
  const [viewportMeasure, setViewportMeasure] = useState<{ key: string; height: number }>();
  const pulseHeight = useRef(0);
  const scrollOffset = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const dismissKeyboard = useCallback(() => { input.current?.blur(); Keyboard.dismiss(); }, []);
  const matching = isMatching(flow.phase);
  const assignment = flow.phase === 'assigned' ? flow.trip?.assignment : undefined;
  const homeNormal = flow.phase === 'home' && flow.field === null && flow.destination === null;
  const navVisible = homeNormal;
  const navHeight = navVisible ? bottomNavigationHeight(bottomInset) : 0;
  const draftKey = `${flow.origin?.id ?? ''}:${flow.destination?.id ?? ''}:${flow.quote?.pricing ? flow.quote.id : ''}`;
  const reviewing = (flow.phase === 'confirm' && reviewedDraft !== draftKey) || (flow.phase === 'home' && !!flow.destination);
  const scene = flow.field ? 'search' : reviewing ? 'reviewing' : flow.phase === 'home' ? 'home'
    : flow.phase === 'confirm' || flow.phase === 'requesting' ? 'confirm' : matching ? 'matching' : flow.phase;
  const sceneTiming = scene === 'home' || scene === 'search' ? motionTimings.sheetEnter
    : scene === 'matching' || scene === 'assigned' ? motionTimings.success : motionTimings.state;
  const confirmationPillVisible = flow.phase === 'confirm' && !reviewing && flow.field === null;
  const topOcclusion = topFrameShift + Math.max(chromeBottom,
    confirmationPillVisible ? confirmationPillTop + confirmationPillHeight : 0) + 12;
  const sheetFrameHeight = Math.max(0, height - topFrameShift);
  const homeFloatingSearch = homeNormal && homePanel === 'home' && !reviewing;
  const destinationSearchFloating = flow.field === 'destination' && searchAction === 'results';
  const addressesFloating = flow.field === null && (reviewing || flow.phase === 'confirm' || flow.phase === 'requesting');
  const detachedPanel = homeFloatingSearch || destinationSearchFloating || addressesFloating;
  const roundedPassengerSheet = flow.phase === 'home' || flow.field !== null ||
    flow.phase === 'confirm' || flow.phase === 'requesting';
  // Home, a live Search field and matching are mutually exclusive. One clock
  // follows the active surface and stops when none is visible.
  const searchCycle = useSearchCycle(focused && (homeFloatingSearch ||
    !!flow.field && searchAction === 'results' || matching && pulseVisible));
  const homeRecentLimit = 3;
  const pickingMap = searchAction === 'map' || searchAction === 'contribute-map';
  const snap: SheetSnap = pickingMap ? 0 : flow.field ? 2 : 1;
  // Key only the measured content, never the persistent map/sheet. Search typing and late
  // quotes do not replace the input; review and confirm get independent native layouts.
  const measureKey = JSON.stringify(flow.field ? ['search', flow.field, searchAction] :
    [flow.phase, homePanel, reviewing, flow.quote?.id, flow.origin?.id, flow.destination?.id, flow.quote?.route.geometry]);
  const viewportKey = `${measureKey}:${sheetFrameHeight}`;
  const visibleSheetHeight = visibleSheetMeasure?.key === viewportKey ? visibleSheetMeasure.height : undefined;
  const reportVisibleSheetHeight = useCallback((value: number) => {
    setVisibleSheetMeasure({ key: viewportKey, height: value });
  }, [viewportKey]);
  const currentMeasureKey = useRef(measureKey);
  useLayoutEffect(() => { currentMeasureKey.current = measureKey; }, [measureKey]);
  const headerHeight = headerMeasure?.key === measureKey ? headerMeasure.height : 0;
  const naturalHeight = contentMeasure?.key === measureKey && headerMeasure?.key === measureKey
    ? contentMeasure.height + headerHeight : 0;
  const interaction = useMemo(() => {
    if (sheetFrameHeight <= 0) return undefined;
    if (homeFloatingSearch) {
      const panelHeight = sheetFrameHeight * 0.50;
      const targetOffset = sheetFrameHeight - panelHeight;
      return createRideSheetInteraction(sheetFrameHeight + homeSearchAccessoryHeight, targetOffset, [targetOffset]);
    }
    const base = rideSheetGeometry(sheetFrameHeight, snap);
    if (flow.field || !naturalHeight) return createRideSheetInteraction(sheetFrameHeight, base.targetOffset, [base.targetOffset]);
    // Content determines the single valid rest position while preserving the current drag range.
    const maximum = flow.phase === 'home' && !reviewing ? sheetFrameHeight * 0.60 : sheetFrameHeight * t.components.bottomSheetSnapPointsPercent[2]! / 100;
    const visibleHeight = Math.min(maximum, Math.max(sheetFrameHeight * t.components.bottomSheetSnapPointsPercent[0]! / 100, naturalHeight));
    const targetOffset = sheetFrameHeight - visibleHeight;
    return createRideSheetInteraction(sheetFrameHeight, targetOffset, [targetOffset]);
  }, [sheetFrameHeight, snap, flow.field, flow.phase, reviewing, naturalHeight, homeFloatingSearch]);
  const actualSheetHeight = viewportMeasure?.key === measureKey && headerMeasure?.key === measureKey
    ? viewportMeasure.height + headerHeight : undefined;
  const settledSheetHeight = naturalHeight && interaction && actualSheetHeight !== undefined &&
    Math.abs(actualSheetHeight - (sheetFrameHeight - interaction.targetOffset)) < 1 ? actualSheetHeight : undefined;
  const routeFit = usePassengerRouteFit({ quote: flow.quote, origin: flow.origin, destination: flow.destination,
    reviewing, confirming: flow.phase === 'confirm' && !reviewing, searchActive: flow.field !== null,
    ready: mapReady && !mapFailed && focused && mapWidth > 0 && mapLayoutNavHeight === navHeight &&
      height - (settledSheetHeight ?? height) > topOcclusion,
    measuredSheetHeight: settledSheetHeight, confirmationRequest: routeFitRequestId });
  // The sheet reports its actual visible footprint, including Home's detached search.
  // Before that measurement arrives, the interaction yields the same top edge.
  const usefulHeight = visibleSheetHeight === undefined
    ? Math.max(0, height - (interaction ? (interaction.height ?? sheetFrameHeight) - interaction.targetOffset : 0))
    : Math.max(0, height - visibleSheetHeight);
  const bottomFootprint = Math.max(0, height - usefulHeight);
  const controlClearance = mapControlSize * 2 + t.spacing.scalePx[1]! + t.spacing.scalePx[1]!;
  const controlsFit = homeFloatingSearch ? usefulHeight - topOcclusion >= controlClearance
    : (interaction?.targetOffset ?? sheetFrameHeight) > 130;
  const locationFits = homeFloatingSearch ? usefulHeight - topOcclusion >= locationCtaHeight + t.spacing.scalePx[1]!
    : usefulHeight - topFrameShift > 130;
  const locationVisibility = useLocationVisibility(nativeMap, flow.currentLocation?.coordinate, mapWidth, usefulHeight,
    mapReady && focused, topFrameShift + chromeBottom);
  const locationCtaVisible = mapReady && locationFits &&
    (locationVisibility.outside || centered || homeFloatingSearch && homePanNeedsRecenter && !!flow.currentLocation);
  const announcedAssignment = useRef<string | undefined>(undefined);
  useEffect(() => {
    scrollOffset.current = 0;
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [measureKey]);
  useEffect(() => {
    if (assignment && announcedAssignment.current !== assignment.id) {
      announcedAssignment.current = assignment.id;
      void semanticHaptics('driverFound');
    }
  }, [assignment]);
  const openField = (target: 'origin' | 'destination') => {
    setRouteFitRequestId(undefined);
    setIncident(null); setMapUserControlled(false); setHomePanNeedsRecenter(false);
    setSearchAction('results'); setSelectedCoordinate(null); flow.openField(target);
  };
  const openSearch = (query = '') => { dismissKeyboard(); openField('destination'); flow.setSearch(query); };
  const sheetTitle = flow.field ? pickingMap ? 'Elegir en el mapa' : searchAction === 'contribute-form' ? 'Agregar lugar' :
    searchAction === 'contribute-done' ? '' : flow.field === 'origin' ? '¿Desde dónde?' : '¿A dónde vamos?'
    : assignment ? `Llegará en ${assignment.etaMinutes} min` : homePanel === 'saved' ? 'Lugares guardados'
      : homePanel === 'favorites' ? 'Favoritos' : homePanel === 'recents' ? 'Viajes recientes' : '';
  const destinationSearchTitleVisible = flow.field === 'destination' && searchAction === 'results' &&
    sheetTitle === '¿A dónde vamos?';
  const blocked = flow.pending || flow.connection !== 'online';
  const searchField = <View style={styles.searchFieldFrame}><SearchInputGlow cycle={searchCycle} focused={searchFocused} />
    <View testID="passenger-search-field" style={[styles.searchField, styles.brandBorder,
      searchFocused && styles.activeBrandBorder]}><SmallPin color={t.colors.red} />
      <TextInput ref={input} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} autoFocus
        onTouchStart={(event) => event.stopPropagation()} accessibilityLabel={sheetTitle} placeholder="Buscar un lugar o dirección"
        value={flow.search} onChangeText={flow.setSearch} onSubmitEditing={() => { dismissKeyboard(); void flow.submitSearch(); }}
        returnKeyType="search" style={styles.searchInput} placeholderTextColor={t.colors.gray} />
      {flow.loadingPlaces ? <ActivityIndicator size="small" color={t.colors.accentBlue} /> : null}</View></View>;
  const addressFields = <View testID="passenger-address-frame" style={styles.addressFrame}>
    <View testID="passenger-address-halo" pointerEvents="none" style={styles.addressHalo} />
    <View testID="passenger-address-panel" style={styles.addressSurface}>
      <View style={styles.addressInterior}>
        {reviewing ? <OriginField embedded place={flow.origin} status={flow.originStatus} onPress={() => openField('origin')} />
          : <AddressField embedded rowTestID="passenger-origin-row" label="Origen" place={flow.origin}
            color={t.colors.green} onPress={() => openField('origin')} disabled={blocked} />}
        {!reviewing ? flow.quote?.stops.map((place) => <Fragment key={place.id}>
          <View testID="passenger-address-divider" style={styles.addressDivider} />
          <AddressField embedded rowTestID="passenger-stop-row" label={place.name} place={place} color={t.colors.gray} disabled />
        </Fragment>) : null}
        <View testID="passenger-address-divider" style={styles.addressDivider} />
        <AddressField embedded rowTestID="passenger-destination-row" label="Destino" place={flow.destination}
          color={t.colors.red} onPress={() => openField('destination')}
          disabled={!reviewing && blocked} />
      </View>
    </View>
  </View>;
  const header = <View key={`header:${measureKey}`} testID="passenger-sheet-header" onTouchStart={dismissKeyboard}
    onLayout={(event) => { if (currentMeasureKey.current === measureKey) setHeaderMeasure({ key: measureKey, height: event.nativeEvent.layout.height }); }}>
    {homeFloatingSearch ? <Animated.View testID="passenger-home-search-frame"
      style={[styles.homeSearchFrame, homeSearchPress.style]}>
      <SearchInputGlow cycle={searchCycle} home /><Pressable testID="passenger-home-floating-search"
      onPressIn={homeSearchPress.onPressIn} onPressOut={homeSearchPress.onPressOut}
      onPress={() => openSearch()} accessibilityRole="button" accessibilityLabel="¿A dónde vamos?"
      style={({ pressed }) => [styles.homeSearch, pressed && surfaces.pressed,
        pressed && styles.pressedElevation, styles.brandBorder, pressed && styles.activeBrandBorder]}>
      <View testID="passenger-home-search-icon-frame" style={styles.homeSearchIconFrame}>
        <VimaGlyph name="search" color={t.colors.graphite} size={21} />
      </View>
      <VimaText variant="bodyMedium">¿A dónde vamos?</VimaText>
    </Pressable></Animated.View> : destinationSearchFloating ? <View testID="passenger-floating-accessory"
      style={styles.floatingSearchFrame}>{searchField}</View> : addressesFloating ? <View testID="passenger-floating-accessory"
      style={styles.floatingAddressesFrame}>{addressFields}</View> : null}
    {detachedPanel ? <View testID="passenger-accessory-gap" style={styles.accessoryGap} /> : null}
    <View testID="passenger-panel-header" style={[styles.sheetHeader, detachedPanel && styles.detachedPanelHeader]}>
      {detachedPanel ? <View testID="passenger-panel-background" pointerEvents="none"
        style={[styles.detachedPanelBackground, { height: sheetFrameHeight }]} /> : null}
      <View style={styles.handle} />
      {destinationSearchTitleVisible || addressesFloating ? null
        : sheetTitle ? <VimaText variant={flow.phase === 'home' || assignment ? 'h3' : 'bodyMedium'} style={[styles.center, !!assignment && styles.eta]}
        accessibilityRole="header">{sheetTitle}</VimaText> : null}
    </View>
  </View>;
  const edit = async () => { dismissKeyboard(); if (await flow.edit()) setReviewedDraft(undefined); };
  const schedule = async () => {
    dismissKeyboard();
    const draft = await flow.schedule();
    if (draft) { setReviewedDraft(undefined); boundaries.schedule(draft); }
  };
  const openSavedPicker = (target: 'home' | 'work' | 'favorite') => {
    dismissKeyboard(); setRouteFitRequestId(undefined); setIncident(null);
    setMapUserControlled(false); setHomePanNeedsRecenter(false);
    setSearchAction('results'); setSelectedCoordinate(null); flow.openSavedPicker(target);
  };
  const toggleMapLayer = (layer: keyof TrafficLayerPreferences) => {
    const next = { ...mapLayers, [layer]: !mapLayers[layer] };
    if (layer === 'incidents') setIncident(null);
    setMapLayers(next);
    void mapLayerStorage.write(next);
  };
  const recenterMap = () => {
    if (!flow.currentLocation) return;
    pendingCenter.current = flow.currentLocation.coordinate; setRecentering(true); setCentered(false);
    setRecenter((previous) => ({ coordinate: flow.currentLocation!.coordinate, sequence: (previous?.sequence ?? 0) + 1 }));
  };
  const choosePlace = (place: Place | PlaceSuggestion, target?: 'origin' | 'destination') => {
    setRouteFitRequestId(undefined);
    void semanticHaptics('buttonChip');
    if (!flow.field && homePanel !== 'home') setHomePanel('home');
    dismissKeyboard(); setMapUserControlled(false); setHomePanNeedsRecenter(false);
    setSearchAction('results'); void flow.choosePlace(place, target);
  };
  const confirmMapSelection = () => {
    if (!selectedCoordinate) return;
    setSearchAction('results'); setMapUserControlled(false);
    void flow.chooseMapCoordinate(selectedCoordinate, flow.field ?? 'destination');
  };
  const submitContribution = async () => {
    if (!selectedCoordinate || !contributionName.trim()) return;
    const place = await flow.contributePlace({ name: contributionName.trim(), coordinate: selectedCoordinate,
      ...(contributionReference.trim() ? { reference: contributionReference.trim() } : {}) });
    if (place) { setContributedPlace(place); setSearchAction('contribute-done'); }
  };
  const goHome = () => {
    setRouteFitRequestId(undefined); dismissKeyboard(); setIncident(null); setLayersOpen(false);
    setSearchAction('results'); setSelectedCoordinate(null);
    flow.returnHome(); setHomePanel('home'); setReviewedDraft(undefined);
    setMapUserControlled(false); setHomePanNeedsRecenter(false);
  };
  const goBack = () => {
    setRouteFitRequestId(undefined);
    dismissKeyboard();
    if (incident) { setIncident(null); return; }
    if (layersOpen) { setLayersOpen(false); return; }
    if (flow.field) { setSearchAction('results'); setSelectedCoordinate(null); flow.closeField(); return; }
    if (homePanel !== 'home') { setHomePanel('home'); return; }
    flow.returnHome(); setReviewedDraft(undefined); setMapUserControlled(false); setHomePanNeedsRecenter(false);
  };
  // Scope Android back to the focused shell; active rides keep explicit cancellation.
  const backAction = useRef(goBack);
  useEffect(() => { backAction.current = goBack; });
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { backAction.current(); return true; });
    return () => subscription.remove();
  }, []));
  const quotePrice = flow.quote?.pricing?.status === 'priced' ? { amount: flow.quote.pricing.quote.price.totalMinor / 100, currency: 'MXN' } : flow.quote?.price;
  const money = (amount: number, currency: string) => new Intl.NumberFormat('es-MX', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  const content = <ElementEntrance key={scene} testID="passenger-phase-presence" style={styles.fill}
    timing={sceneTiming} exit exitTiming={sceneTiming} distance={motionDistances.shortEnterY * 2}>
    <Animated.View key={measureKey} testID="passenger-sheet-viewport"
    style={[styles.fill, detachedPanel && styles.detachedPanelContent]}
    onLayout={(event) => { if (currentMeasureKey.current === measureKey) setViewportMeasure({ key: measureKey, height: event.nativeEvent.layout.height }); }}>
    {flow.connection !== 'online' ? <ElementEntrance timing={motionTimings.state}>
      <StatusNotice>Sin conexión · Intentando reconectar</StatusNotice></ElementEntrance> : null}
    {flow.quoteExpired ? <ElementEntrance timing={motionTimings.state}>
      <StatusNotice>La cotización venció. Revisa y confirma la nueva cotización.</StatusNotice></ElementEntrance> : null}
    {flow.error ? <ElementEntrance timing={motionTimings.success}><Animated.View style={errorPress.style}><Pressable
      onPressIn={errorPress.onPressIn} onPressOut={errorPress.onPressOut}
      onPress={flow.retry} accessibilityRole="button" accessibilityLabel={flow.error.message}>
      <StatusNotice retry>{flow.error.message}</StatusNotice>
    </Pressable></Animated.View></ElementEntrance> : null}
    <ScrollView ref={scroll} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
      onTouchStart={() => { dismissKeyboard(); setIncident(null); }} onScrollBeginDrag={dismissKeyboard}
      onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; setPulseVisible(scrollOffset.current < pulseHeight.current); }}>
      <View testID="passenger-sheet-content" style={[styles.content, homeFloatingSearch && styles.homeContent,
        !navVisible && { paddingBottom: base + bottomInset }]}
        onLayout={(event) => { if (currentMeasureKey.current === measureKey) setContentMeasure({ key: measureKey, height: event.nativeEvent.layout.height }); }}>
      {flow.field && pickingMap ? <>
        <VimaText variant="bodySmall" style={styles.center}>Toca el mapa para elegir la ubicación</VimaText>
        <VimaButton label={searchAction === 'map' ? 'Confirmar ubicación' : 'Continuar'}
          disabled={!selectedCoordinate} onPress={() => { if (searchAction === 'map') confirmMapSelection();
            else setSearchAction('contribute-form'); }} />
        <TextAction label="Cancelar" onPress={() => { setSearchAction('results'); setSelectedCoordinate(null); }} />
      </> : flow.field && searchAction === 'contribute-form' ? <>
        <VimaText variant="bodySmall">Nombre del lugar *</VimaText>
        <TextInput accessibilityLabel="Nombre del lugar" value={contributionName} onChangeText={setContributionName}
          style={styles.contributionInput} maxLength={120} />
        <VimaText variant="bodySmall">Referencia (opcional)</VimaText>
        <TextInput accessibilityLabel="Referencia" value={contributionReference} onChangeText={setContributionReference}
          style={styles.contributionInput} maxLength={240} />
        <VimaText variant="caption" style={styles.muted}>Este lugar quedará pendiente de validación pública.</VimaText>
        <VimaButton label="Guardar" disabled={!contributionName.trim() || flow.pending}
          onPress={() => { void submitContribution(); }} />
      </> : flow.field && searchAction === 'contribute-done' ? <>
        <View style={styles.successIcon}><VimaGlyph name="check" color={t.colors.greenDark} /></View>
        <VimaText variant="h3" style={styles.center}>Lugar agregado</VimaText>
        <VimaText variant="bodySmall" style={styles.center}>Ya puedes usar este lugar como destino.</VimaText>
        <VimaButton label="Usar ahora" disabled={!contributedPlace} onPress={() => { if (contributedPlace) choosePlace(contributedPlace); }} />
        <VimaButton secondary label="Agregar otro lugar" onPress={() => {
          setContributedPlace(null); setSelectedCoordinate(null); setContributionName(''); setContributionReference('');
          setSearchAction('contribute-map');
        }} />
      </> : flow.field ? <>
        {!destinationSearchFloating ? searchField : null}
        {flow.search.trim() ? <>
          {flow.places.length ? <View testID="passenger-search-results" style={styles.searchResults}>
            {flow.places.map((place, index) => <PlaceRow key={place.id} place={place} presentation="list"
              staggerIndex={index} exit resolveMedia={gateway.resolvePlaceMedia} onPress={() => choosePlace(place)} />)}
          </View> : null}
          {flow.loadingPlaces && !flow.places.length ? <View accessible accessibilityLabel="Buscando lugares" style={styles.searchSkeleton}>
            <View style={styles.skeletonLine} /><View style={styles.skeletonLineShort} />
          </View> : null}
          {flow.settledQuery && !flow.places.length && !flow.error ? <>
            <View style={styles.emptyIcon}><VimaGlyph name="search" color={t.colors.accentBluePressed} /></View>
            <VimaText variant="h3" style={styles.center}>No encontramos resultados</VimaText>
            <VimaButton secondary label="Elegir en el mapa" onPress={() => {
              setSelectedCoordinate(null); setSearchAction('map');
            }} />
            <VimaButton label="Agregar lugar" onPress={() => {
              setSelectedCoordinate(null); setContributionName(flow.search.trim()); setContributionReference('');
              setSearchAction('contribute-map');
            }} />
          </> : null}
        </> : <>
          {flow.favorites.length ? <><VimaText variant="bodyMedium">Favoritos</VimaText>
            {flow.favorites.map(place => <PlaceRow key={place.id} place={place} presentation="list" resolveMedia={gateway.resolvePlaceMedia} onPress={() => choosePlace(place)} />)}</> : null}
          {flow.recents.length ? <><VimaText variant="bodyMedium">Recientes</VimaText>
            {flow.recents.map(place => <PlaceRow key={place.id} place={place} presentation="list" resolveMedia={gateway.resolvePlaceMedia} onPress={() => choosePlace(place)} />)}</> : null}
          {flow.popular.length ? <><VimaText variant="bodyMedium">Populares en tu zona</VimaText>
            {flow.popular.map(place => <PlaceRow key={place.id} place={place} presentation="list" resolveMedia={gateway.resolvePlaceMedia} onPress={() => choosePlace(place)} />)}</> : null}
          {flow.featured.length ? <><VimaText variant="bodyMedium">Vima Local</VimaText>
            {flow.featured.map(place => <PlaceRow key={place.id} place={place} presentation="list" resolveMedia={gateway.resolvePlaceMedia} onPress={() => choosePlace(place)} />)}</> : null}
        </>}
      </> : reviewing ? <>
        {gateway.saveFavorite && flow.destination ? <TextAction
          label={flow.favorites.some(place => (place.canonicalId ?? place.id) === (flow.destination?.canonicalId ?? flow.destination?.id))
            ? 'En Favoritos' : 'Agregar a Favoritos'} onPress={() => {
            const place = flow.destination!; const id = place.canonicalId ?? place.id;
            void (flow.favorites.some(favorite => (favorite.canonicalId ?? favorite.id) === id)
              ? flow.removeFavorite(id) : flow.saveFavorite(place));
          }} /> : null}
        <VimaButton label="Confirmar ubicaciones"
          disabled={!validDraft(flow.origin, flow.destination)} onPress={() => {
            setReviewedDraft(draftKey);
            setRouteFitRequestId(++routeFitSerial.current);
            void flow.confirmLocations();
            if (flow.phase === 'home' && flow.destination) flow.choosePlace(flow.destination, 'destination');
          }} />
      </> : flow.phase === 'home' && homePanel === 'saved' ? <>
        <TextAction label="Volver" onPress={() => setHomePanel('home')} />
        <SavedSlotEntry label="Casa" place={flow.savedSlots.home} onChange={() => openSavedPicker('home')}
          onRemove={() => { void flow.removeSavedSlot('home'); }} />
        <SavedSlotEntry label="Trabajo" place={flow.savedSlots.work} onChange={() => openSavedPicker('work')}
          onRemove={() => { void flow.removeSavedSlot('work'); }} />
        <View style={styles.recentHeader}><VimaText variant="bodyMedium" style={styles.fill}>Favoritos</VimaText></View>
        {flow.favorites.map(place => <View key={place.id}>
          <PlaceRow place={place} resolveMedia={gateway.resolvePlaceMedia} onPress={() => choosePlace(place, 'destination')} />
          <TextAction danger label={`Eliminar ${place.name}`} onPress={() => { void flow.removeFavorite(place.canonicalId ?? place.id); }} />
        </View>)}
        <VimaButton secondary label="Agregar favorito" onPress={() => openSavedPicker('favorite')} />
      </> : flow.phase === 'home' && homePanel === 'favorites' ? <>
        <TextAction label="Volver" onPress={() => setHomePanel('home')} />
        {flow.favorites.map(place => <View key={place.id}>
          <PlaceRow place={place} resolveMedia={gateway.resolvePlaceMedia} onPress={() => choosePlace(place, 'destination')} />
          <TextAction danger label={`Eliminar ${place.name}`} onPress={() => { void flow.removeFavorite(place.canonicalId ?? place.id); }} />
        </View>)}
        <VimaButton secondary label="Agregar favorito" onPress={() => openSavedPicker('favorite')} />
      </> : flow.phase === 'home' && homePanel === 'recents' ? <>
        <TextAction label="Volver" onPress={() => setHomePanel('home')} />
        {flow.recents.map(place => <PlaceRow key={place.id} place={place} rich presentation="list" resolveMedia={gateway.resolvePlaceMedia}
          onPress={() => choosePlace(place, 'destination')} />)}
      </> : flow.phase === 'home' ? <>
        <View style={styles.recentHeader}><VimaText variant="bodyMedium" style={styles.fill}>Lugares guardados</VimaText>
          <TextAction label="Ver todos" onPress={() => { setHomePanNeedsRecenter(false); setHomePanel('saved'); }} /></View>
        <View style={styles.quickRow}>
          <QuickPlace label="Casa" icon="home"
            onPress={() => flow.savedSlots.home ? choosePlace(flow.savedSlots.home, 'destination') : openSavedPicker('home')} />
          <View style={styles.quickDivider} />
          <QuickPlace label="Trabajo" icon="work"
            onPress={() => flow.savedSlots.work ? choosePlace(flow.savedSlots.work, 'destination') : openSavedPicker('work')} />
          <View style={styles.quickDivider} />
          <QuickPlace label="Favoritos" icon="favorite" onPress={() => { setHomePanNeedsRecenter(false); setHomePanel('favorites'); }} />
        </View>
        <View style={styles.recentHeader}><VimaText variant="bodyMedium" style={styles.fill}>Viajes recientes</VimaText>
          <TextAction label="Ver todos" onPress={() => { setHomePanNeedsRecenter(false); setHomePanel('recents'); }} /></View>
        {flow.recents.slice(0, homeRecentLimit).map((place) => <PlaceRow key={place.id} place={place} rich presentation="list" resolveMedia={gateway.resolvePlaceMedia}
          onPress={() => choosePlace(place, 'destination')} />)}
      </> : flow.phase === 'confirm' || flow.phase === 'requesting' ? <>
        {flow.loadingQuote ? <ActivityIndicator color={t.colors.greenDark} /> : null}
        {flow.quote ? <>
          <View style={styles.metrics}>
            <Metric icon="car" value={`${flow.quote.durationMinutes} min`} label="Duración" />
            <Metric icon="route" value={`${flow.quote.distanceKm} km`} label="Distancia" />
            <Metric icon="payment" value={quotePrice ? money(quotePrice.amount, quotePrice.currency) : 'Precio no disponible'}
              label={quotePrice ? 'Precio estimado' : 'Sin tarifa'} emphasis={!!quotePrice} />
          </View>
          <View style={styles.paymentRow}><View style={styles.paymentIcon}><VimaGlyph name="payment" color={t.colors.graphite} /></View>
            <VimaText variant="bodySmall" style={[styles.fill, !flow.quote.paymentMethod && styles.muted]}>{flow.quote.paymentMethod ?? 'Método de pago no configurado'}</VimaText>
          </View>
        </> : null}
        <VimaButton label="Solicitar viaje" onPress={() => { void flow.submit(); }} haptic="requestRide"
          loading={flow.phase === 'requesting'} disabled={!flow.canSubmit} />
      </> : assignment ? <>
        <View style={styles.driverCard}>
          <View style={styles.row}>
            <View style={styles.avatar}><VimaGlyph name="profile" color={t.colors.greenDark} /></View>
            <View style={styles.fill}><VimaText variant="bodyMedium">{assignment.driver.name}</VimaText>
              <View style={styles.rating}><VimaGlyph name="star" color={t.colors.amber} /><VimaText variant="bodySmall">{assignment.driver.rating}</VimaText></View>
            </View>
          </View>
          <View style={styles.pin}><VimaText variant="caption" style={styles.muted}>PIN</VimaText>
            <VimaText variant="h1" selectable accessibilityLabel={`PIN ${assignment.pin.split('').join(' ')}`}>{assignment.pin}</VimaText></View>
          <View style={styles.vehicle}>
            {boundaries.vehicleImage ? <Image source={boundaries.vehicleImage} style={styles.vehicleImage} resizeMode="contain" />
              : <View style={styles.vehicleImage} accessible accessibilityLabel="Imagen del vehículo no disponible"><VimaGlyph name="car" color={t.colors.graphite} /></View>}
            <View style={styles.fill}><VimaText variant="bodyMedium">{assignment.vehicle.name}</VimaText>
              <VimaText variant="bodySmall" style={styles.muted}>{assignment.vehicle.color}</VimaText>
              <VimaText variant="h3" selectable>{assignment.vehicle.plate}</VimaText></View>
          </View>
        </View>
        <View style={styles.row}><VimaButton style={styles.fill} secondary communication icon="phone" label="Llamar" onPress={() => boundaries.call(assignment)} disabled={blocked} />
          <VimaButton style={styles.fill} secondary icon="shield" label="Seguridad" onPress={() => boundaries.safety(assignment)} /></View>
        <TextAction danger label="Cancelar viaje" onPress={() => { void flow.act('cancel'); }} disabled={blocked} />
      </> : matching ? <>
        <View onLayout={(event) => { pulseHeight.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height;
          setPulseVisible(scrollOffset.current < pulseHeight.current); }}>
          <SearchPulse visible={focused && pulseVisible} expanded={flow.phase === 'expanding'} cycle={searchCycle} />
        </View>
        <ElementEntrance key={`matching-copy:${flow.phase}`} timing={motionTimings.state} style={styles.matchingCopy}>
          <VimaText variant="h3" style={styles.matchingTitle}>{flow.phase === 'prolonged'
            ? 'Aún buscamos un conductor' : 'Buscando un conductor\ncerca de ti...'}</VimaText>
          <VimaText variant="bodySmall" style={[styles.center, styles.muted]}>{flow.phase === 'prolonged'
            ? 'Puede tomar unos minutos más.\nPuedes editar, programar o cancelar.' : flow.phase === 'expanding'
              ? 'Puede tomar unos minutos más.' : 'Te conectaremos con el conductor más cercano disponible.'}</VimaText>
        </ElementEntrance>
        {flow.phase === 'prolonged' ? <>
          <MatchingProgress />
          <View style={styles.matchingActions}>
          <VimaButton style={styles.fill} secondary compact label="Editar" onPress={() => { void edit(); }} disabled={blocked} />
          <VimaButton style={styles.fill} secondary compact label="Programar" onPress={() => { void schedule(); }} disabled={blocked} />
          <VimaButton style={styles.fill} secondary compact danger label="Cancelar" onPress={() => { void flow.act('cancel'); }} disabled={blocked} />
          </View>
        </> : <View style={styles.matchingActions}>
          <View style={styles.fill}><MatchingProgress /></View>
          <VimaButton secondary compact danger label="Cancelar" onPress={() => { void flow.act('cancel'); }} disabled={blocked} />
        </View>}
      </> : null}
      </View>
    </ScrollView>
  </Animated.View></ElementEntrance>;
  return <View testID="passenger-root" style={styles.root}>
    <StatusBar style="dark" />
    <View testID="passenger-map-surface" collapsable={false} style={styles.primarySurface}
      onLayout={(event) => { setHeight(event.nativeEvent.layout.height); setMapWidth(event.nativeEvent.layout.width); setMapLayoutNavHeight(navHeight); }}>
      <PassengerRideShell trip={flow.trip} mapViewportStyle={styles.mapViewport}
        map={{ ref: nativeMap, compass: false,
          onRegionIsChanging: event => { if (Number.isFinite(event.nativeEvent.bearing)) setMapBearing(event.nativeEvent.bearing); },
          onRegionWillChange: locationVisibility.start, onRegionDidChange: event => {
          if (Number.isFinite(event.nativeEvent.bearing)) setMapBearing(event.nativeEvent.bearing);
          locationVisibility.settled();
          const target = pendingCenter.current;
          if (target && !event.nativeEvent.userInteraction && event.nativeEvent.center.every((value, i) => Math.abs(value - target[i]!) < 0.00001)) {
            pendingCenter.current = null; setRecentering(false); setCentered(true); setHomePanNeedsRecenter(false);
            void semanticHaptics('pinCorrect');
          }
        }, onTouchStart: () => { pendingCenter.current = null; setRecentering(false); dismissKeyboard();
          setMapUserControlled(true); if (homeFloatingSearch) setHomePanNeedsRecenter(true); },
          onPress: event => { setIncident(null); if (pickingMap) setSelectedCoordinate(normalizeCoordinate(event.nativeEvent.lngLat)); },
          onDidFinishLoadingMap: () => { setMapReady(true); setMapFailed(false); }, onDidFailLoadingMap: () => setMapFailed(true) }}
        mapContent={<PassengerMap quote={flow.quote} assignment={assignment} origin={flow.origin} destination={flow.destination}
          currentLocation={flow.currentLocation} onIncidentSelect={pickingMap ? undefined : setIncident}
          home={flow.phase === 'home' && !flow.destination}
          ready={mapReady} searchPresentationActive={flow.field !== null}
          recenter={recenter} fitRoute={routeFit} northRequest={northRequest} layers={mapLayers} displayKeyAvailable={hasDisplayKey} active={focused}
          manualSelection={pickingMap && selectedCoordinate ? { coordinate: selectedCoordinate,
            kind: flow.field === 'origin' && searchAction === 'map' ? 'origin' : 'destination' } : null}
          cameraMode={reviewing || flow.phase === 'confirm' || mapUserControlled ? 'user-controlled' : 'automatic'} config={mapConfig}
          topOcclusion={topOcclusion}
          locationCtaVisible={locationCtaVisible}
          homeBottomOcclusion={homeFloatingSearch ? bottomFootprint : undefined}
          layersMenuOpen={layersOpen}
          sheetHeight={interaction ? sheetFrameHeight - interaction.targetOffset : sheetFrameHeight * t.components.bottomSheetSnapPointsPercent[snap]! / 100} />}
        sheet={{ interaction, header, style: [styles.sheet, detachedPanel && styles.detachedSheet,
          !detachedPanel && roundedPassengerSheet && styles.roundedPassengerSheet], onVisibleHeightChange: reportVisibleSheetHeight }}
        renderPhase={() => content} />
      <View testID="passenger-top-chrome" pointerEvents="box-none" onTouchStart={dismissKeyboard}
        style={[styles.topChrome, homeNormal && styles.homeTopChrome, { top: homeNormal ? topInset + 8 : topFrameShift + 8 }]}>
        {homeNormal ? <>
          <Image source={require('../../../assets/brand/vima_header_lockup_final.png')} style={styles.headerLockup}
            resizeMode="contain" accessibilityLabel="Vima" />
          <Pressable accessibilityRole="button" accessibilityLabel="Notificaciones" accessibilityHint="Módulo no disponible"
            accessibilityState={{ disabled: true }} disabled hitSlop={4} style={styles.notification}>
            <VimaGlyph name="notifications" color={t.colors.graphite} />
          </Pressable>
        </> : <>
          {!matching && !assignment && flow.phase !== 'requesting' ? <Pressable accessibilityRole="button" accessibilityLabel="Volver"
            onPress={goBack} style={({ pressed }) => [styles.headerSide, pressed && surfaces.pressed]}><VimaGlyph name="back" color={t.colors.graphite} /></Pressable> : null}
          {!confirmationPillVisible ? <VimaText variant={assignment || matching ? 'bodyMedium' : 'h3'} style={styles.headerTitle} accessibilityRole="header">
            {assignment ? 'Tu conductor va en camino' : matching ? 'Buscando un conductor' : ''}
          </VimaText> : null}
        </>}
      </View>
      {confirmationPillVisible || destinationSearchTitleVisible ? <FloatingScreenTitle
        title={confirmationPillVisible ? 'Confirma tu viaje' : '¿A dónde vamos?'}
        top={topFrameShift + confirmationPillTop} /> : null}
      {mapReady && controlsFit ? <View pointerEvents="box-none"
        testID="passenger-map-controls"
        style={[styles.mapControls, { bottom: homeFloatingSearch
          ? bottomFootprint + t.spacing.scalePx[1]!
          : (interaction ? sheetFrameHeight - interaction.targetOffset : 0) + t.spacing.scalePx[2]! }]}>
        <MapControls available={hasDisplayKey} layers={mapLayers}
          compass={<MapCompass bearing={mapBearing} ready={mapReady && !mapFailed}
            onPress={() => setNorthRequest(value => (value ?? 0) + 1)} />}
          open={layersOpen} onOpen={() => setLayersOpen((value) => !value)} onToggle={toggleMapLayer} />
      </View> : null}
      {locationCtaVisible ?
        <View testID="passenger-location-cta" pointerEvents="box-none"
          style={[styles.locationCTA, { bottom: (homeFloatingSearch ? bottomFootprint + t.spacing.scalePx[1]!
            : height - usefulHeight + t.spacing.scalePx[2]!) }]}>
          {centered ? <CenteredToast /> : <LocationCTA busy={recentering} onPress={recenterMap} />}
        </View> : null}
      {incident && (interaction?.targetOffset ?? sheetFrameHeight) > chromeBottom + 100 ? <IncidentCard details={incident}
        topOffset={topFrameShift + chromeBottom + 12} maxHeight={Math.min(200, (interaction?.targetOffset ?? sheetFrameHeight) - chromeBottom - 24)} onClose={() => setIncident(null)} /> : null}
      {!mapFailed && flow.phase === 'home' && !flow.field && !reviewing && (flow.originStatus === 'loading' || flow.originStatus === 'unavailable') ?
        <ElementEntrance style={[styles.mapStatus, { top: topFrameShift + chromeBottom + 12 }]}><Pressable accessibilityRole="button" accessibilityLabel="Origen" onPress={() => openField('origin')} style={styles.row}><VimaGlyph name="info" color={t.colors.blue} /><VimaText variant="caption" accessibilityLiveRegion="polite">
          {flow.originStatus === 'loading' ? 'Obteniendo tu ubicación...' : 'No se pudo obtener tu ubicación'}</VimaText></Pressable></ElementEntrance> : null}
      {mapFailed ? <View style={[styles.mapStatus, { top: topFrameShift + chromeBottom + 12 }]}><VimaGlyph name="warning" color={t.colors.amber} />
        <VimaText variant="caption">No se pudo cargar el mapa</VimaText></View> : null}
    </View>
    <PassengerBottomNavigation visible={navVisible} bottomInset={bottomInset} onHome={goHome} />
    <VimaLaunchSurface active={focused} ready={mapReady || mapFailed} />
  </View>;
}

function SmallPin({ color }: { color: string }) {
  return <View accessible={false} style={styles.pinBox}><View style={[styles.pinShape, { backgroundColor: color }]} /><View style={styles.pinCore} /></View>;
}
function FloatingScreenTitle({ title, top }: { title: 'Confirma tu viaje' | '¿A dónde vamos?'; top: number }) {
  return <ElementEntrance key={title} testID={title === 'Confirma tu viaje'
    ? 'passenger-confirmation-pill' : 'passenger-destination-search-title'} pointerEvents="none" exit
    timing={motionTimings.state} style={[styles.floatingTitle, { top }]}>
    <VimaText variant="bodyMedium" numberOfLines={1} accessibilityRole="header" style={styles.floatingTitleText}>{title}</VimaText>
  </ElementEntrance>;
}
function StatusNotice({ children, retry = false }: { children: string; retry?: boolean }) {
  return <View style={styles.notice}><VimaGlyph name={retry ? 'refresh' : 'info'} color={t.colors.blue} />
    <VimaText variant="caption" accessibilityLiveRegion="polite" style={styles.fill}>{children}</VimaText></View>;
}
function MatchingProgress() {
  return <View accessible={false} style={styles.progress}>
    <View style={styles.progressActive} /><View style={styles.progressDot} /><View style={styles.progressRest} />
    <View style={styles.progressIdle} /><View style={styles.progressIdle} />
  </View>;
}
function OriginField({ place, status, onPress, embedded = false }: {
  place: Place | null; status: OriginStatus; onPress: () => void; embedded?: boolean;
}) {
  const feedback = usePressFeedback();
  return <Animated.View style={feedback.style}><Pressable testID="passenger-origin-row"
    accessibilityRole="button" accessibilityLabel="Origen" onPress={onPress}
    onPressIn={feedback.onPressIn} onPressOut={feedback.onPressOut}
    style={({ pressed }) => [styles.originField, embedded && styles.embeddedAddressField, pressed && surfaces.pressed]}>
    <View style={styles.originDot} />
    <View style={styles.fill}>
      <VimaText variant="caption" style={styles.muted}>Origen</VimaText>
      <VimaText variant="bodySmall">{status === 'loading' ? 'Obteniendo tu ubicación...' : status === 'unavailable'
        ? 'No se pudo obtener tu ubicación' : status === 'automatic' ? 'Tu ubicación actual' : place?.name}</VimaText>
      {place?.address ? <VimaText variant="caption" style={styles.muted} numberOfLines={1}>{place.address}</VimaText> : null}
    </View>
    <VimaGlyph name="chevron" />
  </Pressable></Animated.View>;
}
function AddressField({ label, place, color, onPress, disabled, embedded = false, rowTestID }: {
  label: string; place?: Place | null; color: string; onPress?: () => void; disabled?: boolean; embedded?: boolean; rowTestID?: string;
}) {
  const feedback = usePressFeedback();
  return <Animated.View style={feedback.style}><Pressable testID={rowTestID}
    onPress={onPress} disabled={disabled} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${label} ${place?.name ?? ''}`}
    onPressIn={onPress && !disabled ? feedback.onPressIn : undefined} onPressOut={onPress && !disabled ? feedback.onPressOut : undefined}
    style={({ pressed }) => [styles.address, embedded && styles.embeddedAddressField, pressed && !disabled && surfaces.pressed]}>
    <SmallPin color={color} />
    <View style={styles.fill}><VimaText variant="caption" style={styles.addressLabel}>{label}</VimaText>
      <VimaText variant="bodySmall" style={!place && styles.muted} numberOfLines={1}>{place?.name ?? label}</VimaText>
      {place ? <VimaText variant="caption" style={styles.muted} numberOfLines={1}>{place.address}</VimaText> : null}</View>
  </Pressable></Animated.View>;
}
function PlaceRow({ place, onPress, resolveMedia, rich = false, presentation = 'card', staggerIndex, exit = false }: { place: PlaceSuggestion; onPress: () => void;
  resolveMedia?: PassengerGateway['resolvePlaceMedia']; rich?: boolean; presentation?: 'card' | 'list'; staggerIndex?: number; exit?: boolean }) {
  const feedback = usePressFeedback();
  return <ElementEntrance staggerIndex={staggerIndex} exit={exit}><Animated.View style={feedback.style}><Pressable
    accessibilityRole="button" accessibilityLabel={`${place.name}, ${place.address}`} onPress={onPress}
    onPressIn={feedback.onPressIn} onPressOut={feedback.onPressOut}
    style={({ pressed }) => [presentation === 'list' ? styles.listRow : styles.recent, rich && styles.richRecent,
      pressed && (presentation === 'list' ? styles.listRowPressed : surfaces.pressed),
      pressed && presentation === 'card' && styles.pressedElevation]}>
    <PlaceThumbnail place={place} resolveMedia={resolveMedia} size={rich ? 64 : 48} />
    <View style={styles.fill}><VimaText variant="bodyMedium">{place.name}</VimaText>
      <VimaText variant="bodySmall" style={styles.muted} numberOfLines={rich ? 2 : 1}>{place.address}</VimaText></View>
    <VimaGlyph name="chevron" color={t.colors.gray} />
  </Pressable></Animated.View></ElementEntrance>;
}
function SavedSlotEntry({ label, place, onChange, onRemove }: { label: string; place: Place | null;
  onChange: () => void; onRemove: () => void }) {
  return <View style={styles.savedEntry}>
    <VimaText variant="bodyMedium">{label}</VimaText>
    <VimaText variant="bodySmall" style={styles.muted} numberOfLines={2}>{place ? `${place.name} · ${place.address}` : 'Sin configurar'}</VimaText>
    <View style={styles.row}><TextAction label={place ? 'Cambiar' : 'Configurar'} onPress={onChange} />
      {place ? <TextAction danger label="Eliminar" onPress={onRemove} /> : null}</View>
  </View>;
}
function QuickPlace({ label, icon, onPress }: { label: string; icon: VimaGlyphName; onPress?: () => void }) {
  const feedback = usePressFeedback();
  const content = <><VimaGlyph name={icon} color={t.colors.graphite} size={20} /><VimaText variant="caption" numberOfLines={1}>{label}</VimaText></>;
  return <ElementEntrance style={styles.fill}>{onPress ? <Animated.View style={[styles.fill, feedback.style]}><Pressable
    accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    onPressIn={feedback.onPressIn} onPressOut={feedback.onPressOut}
    style={({ pressed }) => [styles.quickPlace, pressed && surfaces.pressed]}>{content}</Pressable></Animated.View>
    : <View accessible accessibilityLabel={label} style={styles.quickPlace}>{content}</View>}</ElementEntrance>;
}
function Metric({ icon, value, label, emphasis = false }: { icon: VimaGlyphName; value: string; label: string; emphasis?: boolean }) {
  return <View style={[styles.metric, emphasis && styles.metricEmphasis]}><VimaGlyph name={icon} color={emphasis ? t.colors.greenDark : t.colors.graphite} />
    <ElementEntrance key={value} timing={motionTimings.state}><VimaText variant="bodyMedium" style={[styles.center, emphasis && styles.priceValue]}>{value}</VimaText></ElementEntrance>
    <VimaText variant="caption" style={styles.muted}>{label}</VimaText></View>;
}
function TextAction({ label, onPress, disabled, danger = false }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const feedback = usePressFeedback();
  return <Animated.View style={feedback.style}><Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
    onPressIn={feedback.onPressIn} onPressOut={feedback.onPressOut}
    onPress={() => { void semanticHaptics('buttonChip'); onPress(); }} style={({ pressed }) => [styles.textAction, pressed && !disabled && surfaces.pressed]}>
    <VimaText variant="bodySmall" style={[styles.center, styles.link, danger && styles.dangerText, disabled && styles.muted]}>{label}</VimaText></Pressable></Animated.View>;
}

const [xs, sm, md, lg, base] = t.spacing.scalePx as [number, number, number, number, number];
const styles = StyleSheet.create({
  fill: { flex: 1 }, center: { textAlign: 'center' }, muted: { color: t.colors.gray },
  root: { flex: 1, backgroundColor: '#F6F7F8' },
  primarySurface: { flex: 1 },
  mapViewport: { marginHorizontal: 4, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden', backgroundColor: '#F6F7F8' },
  topChrome: { position: 'absolute', left: 16, right: 16, minHeight: 48, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  homeTopChrome: { minHeight: 44 },
  headerLockup: { width: 672 * 32 / 200, height: 32, ...elevationStyle('level1', t.colors.carbon) },
  headerSide: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center',
    borderRadius: t.radii.pillPx, backgroundColor: t.colors.white },
  notification: { position: 'absolute', top: 0, right: 0, width: 52, height: 52,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: t.radii.pillPx, backgroundColor: t.colors.white,
    ...elevationStyle('level2', t.colors.carbon) },
  headerTitle: { flex: 1, textAlign: 'center', color: t.colors.carbon },
  floatingTitle: { position: 'absolute', alignSelf: 'center', height: confirmationPillHeight,
    paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.white, zIndex: 3, ...elevationStyle('level1', t.colors.carbon) },
  floatingTitleText: { fontFamily: interFamilies[600], fontSize: 16, fontWeight: '600', color: t.colors.carbon,
    textAlign: 'center' },
  sheet: { overflow: 'hidden' },
  roundedPassengerSheet: { borderTopLeftRadius: passengerPanelTopRadius, borderTopRightRadius: passengerPanelTopRadius },
  detachedSheet: { overflow: 'visible', backgroundColor: 'transparent', borderWidth: 0, boxShadow: [] },
  detachedPanelHeader: { paddingBottom: sm },
  detachedPanelBackground: { position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: t.colors.white, borderTopLeftRadius: passengerPanelTopRadius,
    borderTopRightRadius: passengerPanelTopRadius, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  detachedPanelContent: { backgroundColor: 'transparent', borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0, overflow: 'hidden' },
  accessoryGap: { height: homeSearchGap },
  floatingSearchFrame: { marginHorizontal: base },
  floatingAddressesFrame: { marginHorizontal: base },
  sheetHeader: { paddingHorizontal: base, alignItems: 'center', paddingTop: sm, paddingBottom: md, gap: sm },
  handle: { width: t.spacing.scalePx[7], height: t.spacing.scalePx[0], borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight },
  content: { paddingHorizontal: t.spacing.mobileHorizontalMarginPx, paddingBottom: base, gap: md },
  homeContent: { gap: sm },
  originField: { ...surfaces.field, minHeight: t.components.inputPrimary.heightPx, flexDirection: 'row', alignItems: 'center', gap: md,
    paddingHorizontal: md, paddingVertical: sm, ...elevationStyle('level1', t.colors.carbon) },
  originDot: { width: sm, height: sm, borderRadius: t.radii.pillPx, backgroundColor: t.colors.green },
  row: { flexDirection: 'row', alignItems: 'center', gap: md },
  homeSearchFrame: { position: 'relative', alignSelf: 'center', marginHorizontal: base, height: homeSearchHeight },
  homeSearch: { ...surfaces.card, height: homeSearchHeight, borderRadius: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24,
    ...elevationStyle('level1', t.colors.carbon) },
  homeSearchIconFrame: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  brandBorder: { borderColor: t.colors.green },
  activeBrandBorder: { borderColor: t.colors.greenDark },
  pressedElevation: { boxShadow: [] },
  quickRow: { ...surfaces.card, height: 44, flexDirection: 'row', alignItems: 'center',
    borderRadius: t.radii.pillPx, ...elevationStyle('level1', t.colors.carbon) },
  quickPlace: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: xs, gap: xs },
  quickDivider: { width: t.borders.standardWidthPx, height: 24, backgroundColor: surfaceColors.border },
  savedEntry: { ...surfaces.card, gap: sm, padding: md, ...elevationStyle('level1', t.colors.carbon) },
  recentHeader: { flexDirection: 'row', alignItems: 'center', marginTop: xs },
  recent: { ...surfaces.card, minHeight: t.components.buttonPrimary.heightPx + sm, flexDirection: 'row', alignItems: 'center', gap: md,
    paddingVertical: sm, paddingHorizontal: md, ...elevationStyle('level1', t.colors.carbon) },
  searchResults: { gap: 0 },
  listRow: { minHeight: 56, backgroundColor: t.colors.white, borderBottomWidth: t.borders.standardWidthPx,
    borderBottomColor: surfaceColors.border, borderRadius: t.radii.smallPx, flexDirection: 'row', alignItems: 'center',
    gap: sm, paddingHorizontal: sm, paddingVertical: xs },
  listRowPressed: { backgroundColor: surfaceColors.brandWash },
  richRecent: { minHeight: 72, paddingVertical: xs },
  recentIcon: { width: t.spacing.scalePx[7], height: t.spacing.scalePx[7], alignItems: 'center', justifyContent: 'center',
    borderRadius: t.radii.smallPx, backgroundColor: t.colors.background },
  pinBox: { width: t.components.iconSizesPx[1], height: t.components.iconSizesPx[1], alignItems: 'center', justifyContent: 'center' },
  pinShape: { width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    borderBottomRightRadius: t.radii.smallPx / 2, transform: [{ rotate: '45deg' }] },
  pinCore: { position: 'absolute', width: xs, height: xs, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white, top: sm, left: sm },
  addressFrame: { position: 'relative' },
  addressHalo: { ...StyleSheet.absoluteFill, borderRadius: t.radii.cardPx,
    backgroundColor: surfaceColors.brandWash, opacity: 0.18,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 16, spreadDistance: 4, color: t.colors.green }] },
  addressSurface: { backgroundColor: t.colors.white, borderRadius: t.radii.cardPx,
    borderWidth: t.borders.standardWidthPx, borderColor: t.colors.green },
  addressInterior: { borderRadius: t.radii.cardPx, overflow: 'hidden' },
  addressDivider: { height: t.borders.standardWidthPx, marginHorizontal: md, backgroundColor: surfaceColors.border },
  embeddedAddressField: { minHeight: 46, paddingVertical: sm, borderWidth: 0,
    borderRadius: 0, backgroundColor: 'transparent', boxShadow: [] },
  address: { minHeight: t.components.inputPrimary.heightPx, flexDirection: 'row', alignItems: 'center', gap: md, paddingVertical: md, paddingHorizontal: md },
  addressLabel: { color: t.colors.graphite },
  metrics: { flexDirection: 'row', alignItems: 'stretch', gap: xs },
  metric: { ...surfaces.field, flex: 1, justifyContent: 'center', alignItems: 'center', gap: xs, paddingHorizontal: xs, paddingVertical: md,
    ...elevationStyle('level1', t.colors.carbon) },
  metricEmphasis: { borderColor: t.colors.greenDark, backgroundColor: surfaceColors.brandWash },
  priceValue: { ...textStyle({ variant: 'h3' }), color: t.colors.greenDark },
  paymentRow: { minHeight: t.components.inputPrimary.heightPx, flexDirection: 'row', alignItems: 'center', gap: md,
    paddingHorizontal: md, paddingVertical: sm, borderRadius: t.radii.fieldPx, backgroundColor: t.colors.background,
    ...elevationStyle('level1', t.colors.carbon) },
  paymentIcon: { width: 32, height: 32, borderRadius: t.radii.smallPx, backgroundColor: t.colors.white, alignItems: 'center', justifyContent: 'center' },
  searchFieldFrame: { position: 'relative' },
  searchField: { ...surfaces.card, height: t.components.inputPrimary.heightPx, borderRadius: t.radii.pillPx,
    paddingHorizontal: md, flexDirection: 'row', alignItems: 'center', gap: sm, ...elevationStyle('level1', t.colors.carbon) },
  searchInput: { ...textStyle({ variant: 'body', weight: 400 }), flex: 1, height: t.components.inputPrimary.heightPx, color: t.colors.carbon },
  contributionInput: { ...surfaces.field, ...textStyle({ variant: 'body', weight: 400 }), height: t.components.inputPrimary.heightPx,
    paddingHorizontal: md, color: t.colors.carbon },
  searchSkeleton: { ...surfaces.field, height: t.components.buttonPrimary.heightPx, justifyContent: 'center', gap: sm, paddingHorizontal: md },
  emptyIcon: { width: 64, height: 64, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: t.radii.pillPx, backgroundColor: t.colors.accentBlueSoft, marginTop: lg },
  successIcon: { width: 64, height: 64, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: t.radii.pillPx, backgroundColor: surfaceColors.brandWash, marginTop: lg },
  skeletonLine: { width: '62%', height: sm, borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight },
  skeletonLineShort: { width: '40%', height: xs, borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight },
  matchingActions: { flexDirection: 'row', alignItems: 'center', gap: sm },
  matchingCopy: { gap: md },
  matchingTitle: { textAlign: 'center', alignSelf: 'center', maxWidth: '88%' },
  progress: { height: t.components.iconSizesPx[1], flexDirection: 'row', alignItems: 'center', marginVertical: sm },
  progressActive: { flex: 1, height: t.borders.standardWidthPx * 2, backgroundColor: t.colors.greenDark },
  progressDot: { width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.greenDark, borderWidth: t.borders.standardWidthPx * 2, borderColor: t.colors.white },
  progressRest: { flex: 1, height: t.borders.standardWidthPx * 2, backgroundColor: t.colors.grayLight },
  progressIdle: { width: t.spacing.scalePx[2], height: t.spacing.scalePx[2], borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.grayLight, marginLeft: md },
  textAction: { minHeight: 44, paddingVertical: sm, paddingHorizontal: xs, justifyContent: 'center', borderRadius: t.radii.smallPx },
  link: { color: t.colors.accentBluePressed }, dangerText: { color: t.colors.red },
  notice: { marginHorizontal: base, marginBottom: sm, flexDirection: 'row', alignItems: 'center', gap: sm,
    backgroundColor: t.colors.accentBlueSoft, paddingHorizontal: md, paddingVertical: md, borderRadius: t.radii.fieldPx },
  driverCard: { ...surfaces.card, gap: md, padding: md },
  avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: t.radii.pillPx, backgroundColor: surfaceColors.brandWash },
  rating: { flexDirection: 'row', alignItems: 'center', gap: xs },
  eta: { color: t.colors.greenDark },
  pin: { alignItems: 'center', paddingVertical: sm, gap: xs, borderRadius: t.radii.fieldPx, backgroundColor: t.colors.background },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: md },
  vehicleImage: { width: 88, height: 72, borderRadius: t.radii.fieldPx, backgroundColor: t.colors.background, alignItems: 'center', justifyContent: 'center', padding: sm },
  mapStatus: { ...surfaces.floating, position: 'absolute', top: lg, alignSelf: 'center', padding: md,
    flexDirection: 'row', alignItems: 'center', gap: sm, borderRadius: t.radii.pillPx },
  mapControls: { position: 'absolute', right: t.spacing.mobileHorizontalMarginPx },
  locationCTA: { position: 'absolute', alignSelf: 'center' },
});
