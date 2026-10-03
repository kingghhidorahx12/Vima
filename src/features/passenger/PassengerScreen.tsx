import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, type ImageSourcePropType } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaButton } from '../../design/components/VimaButton';
import { createRideSheetInteraction } from '../../design/components/VimaRideSheet';
import { rideSheetGeometry, type SheetSnap } from '../../design/components/rideSheetGeometry';
import { VimaText } from '../../design/primitives';
import { textStyle } from '../../design/typography';
import { visualTokens as t } from '../../design/tokens';
import { semanticHaptics } from '../../motion/haptics';
import { fadeTo } from '../../motion/helpers';
import { SearchPulse } from '../../motion/SearchPulse';
import { VimaLaunchSurface } from '../../motion/VimaLaunchSurface';
import { motionTimings } from '../../motion/timing';
import { PassengerMap, type PassengerMapConfig } from './PassengerMap';
import { PassengerRideShell } from './PassengerRideShell';
import { isMatching, validDraft, type Assignment, type OriginStatus, type PassengerGateway, type Place, type RideQuote } from './model';
import { usePassengerFlow } from './usePassengerFlow';
import type { PlaceSuggestion } from '../../services/geospatial/contracts';
import { normalizeCoordinate, type Coordinate } from '../../map/models';
import { defaultTrafficLayers, displayKeyAvailable, type TrafficLayerPreferences } from '../../map/traffic';
import { mapLayerStorage } from '../../services/storage/mapLayers';
import { MapControls } from './MapControls';
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

export function PassengerScreen({ gateway, mapConfig, boundaries, inset = true }: PassengerScreenProps) {
  const flow = usePassengerFlow(gateway);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [height, setHeight] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapUserControlled, setMapUserControlled] = useState(false);
  const [mapLayers, setMapLayers] = useState<TrafficLayerPreferences>(defaultTrafficLayers);
  const [layersOpen, setLayersOpen] = useState(false);
  const [incident, setIncident] = useState<IncidentDetails | null>(null);
  const [recenter, setRecenter] = useState<{ coordinate: Coordinate; sequence: number }>();
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
  const [showAll, setShowAll] = useState(false);
  const [pulseVisible, setPulseVisible] = useState(true);
  const [reviewedDraft, setReviewedDraft] = useState<string>();
  const [contentMeasure, setContentMeasure] = useState<{ key: string; height: number }>();
  const [headerHeight, setHeaderHeight] = useState(0);
  const pulseHeight = useRef(0);
  const scrollOffset = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const dismissKeyboard = useCallback(() => { input.current?.blur(); Keyboard.dismiss(); }, []);
  const matching = isMatching(flow.phase);
  const assignment = flow.phase === 'assigned' ? flow.trip?.assignment : undefined;
  const draftKey = `${flow.origin?.id ?? ''}:${flow.destination?.id ?? ''}:${flow.quote?.pricing ? flow.quote.id : ''}`;
  const reviewing = (flow.phase === 'confirm' && reviewedDraft !== draftKey) || (flow.phase === 'home' && !!flow.destination);
  const pickingMap = searchAction === 'map' || searchAction === 'contribute-map';
  const snap: SheetSnap = pickingMap ? 0 : flow.field ? 2 : 1;
  const measureKey = `${flow.phase}:${flow.field ?? ''}:${searchAction}:${reviewing}`;
  const naturalHeight = contentMeasure?.key === measureKey ? contentMeasure.height + headerHeight : 0;
  const interaction = useMemo(() => {
    if (height <= 0) return undefined;
    const base = rideSheetGeometry(height, snap);
    if (flow.field || !naturalHeight) return createRideSheetInteraction(height, base.targetOffset, [base.targetOffset]);
    // Content determines the single valid rest position while preserving the current drag range.
    const maximum = flow.phase === 'home' && !reviewing ? height * 0.60 : height * t.components.bottomSheetSnapPointsPercent[2]! / 100;
    const visibleHeight = Math.min(maximum, Math.max(height * t.components.bottomSheetSnapPointsPercent[0]! / 100, naturalHeight));
    const targetOffset = height - visibleHeight;
    return createRideSheetInteraction(height, targetOffset, [targetOffset]);
  }, [height, snap, flow.field, flow.phase, reviewing, naturalHeight]);
  const contentOpacity = useSharedValue(1);
  const announcedAssignment = useRef<string | undefined>(undefined);
  useEffect(() => {
    scrollOffset.current = 0;
    scroll.current?.scrollTo({ y: 0, animated: false });
    cancelAnimation(contentOpacity);
    contentOpacity.set(0);
    contentOpacity.set(fadeTo(1, flow.phase === 'assigned' ? motionTimings.success : motionTimings.sheetEnter));
    return () => cancelAnimation(contentOpacity);
  }, [contentOpacity, flow.phase]);
  useEffect(() => {
    if (assignment && announcedAssignment.current !== assignment.id) {
      announcedAssignment.current = assignment.id;
      void semanticHaptics('driverFound');
    }
  }, [assignment]);
  const animatedContent = useAnimatedStyle(() => ({ opacity: contentOpacity.get() }));
  const sheetTitle = flow.field ? pickingMap ? 'Elegir en el mapa' : searchAction === 'contribute-form' ? 'Agregar lugar' :
    searchAction === 'contribute-done' ? '' : flow.field === 'origin' ? '¿Desde dónde?' : '¿A dónde vas?'
    : assignment ? `Llegará en ${assignment.etaMinutes} min` : flow.phase === 'home' && !reviewing ? '¿A dónde vas?' : '';
  const header = <View onTouchStart={dismissKeyboard} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)} style={styles.sheetHeader}>
    <View style={styles.handle} />
    {sheetTitle ? <VimaText variant={flow.phase === 'home' ? 'h3' : 'bodyMedium'} style={styles.center}
      accessibilityRole="header">{sheetTitle}</VimaText> : null}
  </View>;
  const blocked = flow.pending || flow.connection !== 'online';
  const edit = async () => { dismissKeyboard(); if (await flow.edit()) setReviewedDraft(undefined); };
  const schedule = async () => {
    dismissKeyboard();
    const draft = await flow.schedule();
    if (draft) { setReviewedDraft(undefined); boundaries.schedule(draft); }
  };
  const openField = (target: 'origin' | 'destination') => {
    setIncident(null); setMapUserControlled(false); setSearchAction('results'); setSelectedCoordinate(null); flow.openField(target);
  };
  const openSearch = (query = '') => { dismissKeyboard(); openField('destination'); flow.setSearch(query); };
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
    void semanticHaptics('buttonChip');
    dismissKeyboard(); setMapUserControlled(false); setSearchAction('results'); void flow.choosePlace(place, target);
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
  const goBack = () => {
    dismissKeyboard();
    if (incident) { setIncident(null); return; }
    if (layersOpen) { setLayersOpen(false); return; }
    if (flow.field) { setSearchAction('results'); setSelectedCoordinate(null); flow.closeField(); return; }
    flow.returnHome(); setReviewedDraft(undefined); setMapUserControlled(false);
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
  const content = <Animated.View style={[styles.fill, animatedContent]}>
    {flow.connection !== 'online' ? <VimaText variant="caption" accessibilityLiveRegion="polite" style={styles.notice}>Sin conexión · Intentando reconectar</VimaText> : null}
    {flow.quoteExpired ? <VimaText variant="caption" accessibilityLiveRegion="polite" style={styles.notice}>La cotización venció. Revisa y confirma la nueva cotización.</VimaText> : null}
    {flow.error ? <Pressable onPress={flow.retry} accessibilityRole="button" accessibilityLabel={flow.error.message}>
      <VimaText variant="caption" accessibilityLiveRegion="polite" style={styles.notice}>{flow.error.message} ↻</VimaText>
    </Pressable> : null}
    <ScrollView ref={scroll} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
      onTouchStart={() => { dismissKeyboard(); setIncident(null); }} onScrollBeginDrag={dismissKeyboard}
      contentContainerStyle={styles.content}
      onContentSizeChange={(_width, contentHeight) => setContentMeasure((previous) => previous?.key === measureKey && previous.height === contentHeight
        ? previous : { key: measureKey, height: contentHeight })}
      onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; setPulseVisible(scrollOffset.current < pulseHeight.current); }}>
      {flow.field && pickingMap ? <>
        <VimaText variant="bodySmall" style={styles.center}>Toca el mapa para elegir la ubicación</VimaText>
        <VimaButton gradient label={searchAction === 'map' ? 'Confirmar ubicación' : 'Continuar'}
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
        <VimaButton gradient label="Guardar" disabled={!contributionName.trim() || flow.pending}
          onPress={() => { void submitContribution(); }} />
      </> : flow.field && searchAction === 'contribute-done' ? <>
        <VimaText variant="h3" style={styles.center}>Lugar agregado</VimaText>
        <VimaText variant="bodySmall" style={styles.center}>Ya puedes usar este lugar como destino.</VimaText>
        <VimaButton gradient label="Usar ahora" disabled={!contributedPlace} onPress={() => { if (contributedPlace) choosePlace(contributedPlace); }} />
        <VimaButton secondary label="Agregar otro lugar" onPress={() => {
          setContributedPlace(null); setSelectedCoordinate(null); setContributionName(''); setContributionReference('');
          setSearchAction('contribute-map');
        }} />
      </> : flow.field ? <>
        <View style={[styles.searchField, searchFocused && styles.searchFocused]}><SmallPin color={t.colors.red} />
          <TextInput ref={input} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} autoFocus onTouchStart={(event) => event.stopPropagation()} accessibilityLabel={sheetTitle} placeholder="Buscar un lugar o dirección" value={flow.search}
            onChangeText={flow.setSearch} onSubmitEditing={() => { dismissKeyboard(); void flow.submitSearch(); }} returnKeyType="search"
            style={styles.searchInput} placeholderTextColor={t.colors.gray} />
          {flow.loadingPlaces ? <ActivityIndicator size="small" color={t.colors.greenDark} /> : null}</View>
        {flow.search.trim() ? <>
          {flow.places.map((place) => <PlaceRow key={place.id} place={place} onPress={() => choosePlace(place)} />)}
          {flow.loadingPlaces && !flow.places.length ? <View accessible accessibilityLabel="Buscando lugares" style={styles.searchSkeleton}>
            <View style={styles.skeletonLine} /><View style={styles.skeletonLineShort} />
          </View> : null}
          {flow.settledQuery && !flow.places.length && !flow.error ? <>
            <VimaText variant="h3" style={styles.center}>No encontramos resultados</VimaText>
            <VimaButton secondary label="Elegir en el mapa" onPress={() => {
              setSelectedCoordinate(null); setSearchAction('map');
            }} />
            <VimaButton gradient label="Agregar lugar" onPress={() => {
              setSelectedCoordinate(null); setContributionName(flow.search.trim()); setContributionReference('');
              setSearchAction('contribute-map');
            }} />
          </> : null}
        </> : <>
          {flow.favorites.length ? <><VimaText variant="bodyMedium">Favoritos</VimaText>
            {flow.favorites.map(place => <PlaceRow key={place.id} place={place} onPress={() => choosePlace(place)} />)}</> : null}
          {flow.recents.length ? <><VimaText variant="bodyMedium">Recientes</VimaText>
            {flow.recents.map(place => <PlaceRow key={place.id} place={place} onPress={() => choosePlace(place)} />)}</> : null}
          {flow.popular.length ? <><VimaText variant="bodyMedium">Populares en tu zona</VimaText>
            {flow.popular.map(place => <PlaceRow key={place.id} place={place} onPress={() => choosePlace(place)} />)}</> : null}
          {flow.featured.length ? <><VimaText variant="bodyMedium">Vima Local</VimaText>
            {flow.featured.map(place => <PlaceRow key={place.id} place={place} onPress={() => choosePlace(place)} />)}</> : null}
        </>}
      </> : reviewing ? <>
        <View style={styles.addressGroup}>
          <OriginField place={flow.origin} status={flow.originStatus} onPress={() => openField('origin')} />
          <View style={styles.addressRule} />
          <AddressField label="Destino" place={flow.destination} color={t.colors.red} onPress={() => openField('destination')} />
        </View>
        {gateway.saveFavorite && flow.destination ? <TextAction
          label={flow.favorites.some(place => (place.canonicalId ?? place.id) === (flow.destination?.canonicalId ?? flow.destination?.id))
            ? 'En Favoritos' : 'Agregar a Favoritos'} onPress={() => {
            const place = flow.destination!; const id = place.canonicalId ?? place.id;
            void (flow.favorites.some(favorite => (favorite.canonicalId ?? favorite.id) === id)
              ? flow.removeFavorite(id) : flow.saveFavorite(place));
          }} /> : null}
        <VimaButton gradient label="Confirmar ubicaciones"
          disabled={!validDraft(flow.origin, flow.destination)} onPress={() => {
            setReviewedDraft(draftKey);
            void flow.confirmLocations();
            if (flow.phase === 'home' && flow.destination) flow.choosePlace(flow.destination, 'destination');
          }} />
      </> : flow.phase === 'home' ? <>
        <OriginField place={flow.origin} status={flow.originStatus} onPress={() => openField('origin')} />
        <Pressable onPress={() => openSearch()} accessibilityRole="button" accessibilityLabel="¿A dónde vas?" style={styles.homeSearch}>
          <SmallPin color={t.colors.red} />
          <VimaText variant="bodySmall" style={styles.muted}>Buscar un lugar o dirección</VimaText>
        </Pressable>
        <View style={styles.quickRow}>
          <QuickPlace label="Casa" icon="home" onPress={() => openSearch('Casa')} />
          <QuickPlace label="Trabajo" icon="work" onPress={() => openSearch('Trabajo')} />
          <QuickPlace label="Favoritos" icon="favorite" onPress={() => openSearch()} />
        </View>
        <View style={styles.recentHeader}><VimaText variant="bodyMedium" style={styles.fill}>Viajes recientes</VimaText>
          <TextAction label="Ver todos" onPress={() => setShowAll(true)} /></View>
        {(showAll ? flow.recents : flow.recents.slice(0, 2)).map((place) => <PlaceRow key={place.id} place={place}
          onPress={() => choosePlace(place, 'destination')} />)}
      </> : flow.phase === 'confirm' || flow.phase === 'requesting' ? <>
        <View style={[styles.addressGroup, styles.confirmAddressGroup]}>
          <AddressField label="Origen" place={flow.origin} color={t.colors.green} onPress={() => openField('origin')} disabled={blocked} />
          {flow.quote?.stops.map((place) => <AddressField key={place.id} label={place.name} place={place} color={t.colors.gray} disabled />)}
          <View style={styles.addressRule} />
          <AddressField label="Destino" place={flow.destination} color={t.colors.red} onPress={() => openField('destination')} disabled={blocked} />
        </View>
        {flow.loadingQuote ? <ActivityIndicator color={t.colors.greenDark} /> : null}
        {flow.quote ? <>
          <View style={styles.metrics}>
            <Metric icon="car" value={`${flow.quote.durationMinutes} min`} label="Duración" />
            <Metric icon="route" value={`${flow.quote.distanceKm} km`} label="Distancia" />
            <Metric icon="payment" value={quotePrice ? money(quotePrice.amount, quotePrice.currency) : '—'} label="Precio estimado" />
          </View>
          {flow.quote.pricing?.status === 'unpriced' ? <VimaText variant="caption" style={styles.muted}>Precio no disponible</VimaText> : null}
          <View style={styles.paymentRow}><VimaGlyph name="payment" /><VimaText variant="bodySmall" style={styles.fill}>{flow.quote.paymentMethod ?? '—'}</VimaText><VimaGlyph name="chevron" color={t.colors.gray} /></View>
        </> : null}
        <VimaButton gradient label="Solicitar viaje" onPress={() => { void flow.submit(); }} haptic="requestRide"
          loading={flow.phase === 'requesting'} disabled={!flow.canSubmit} />
      </> : assignment ? <>
        <View style={styles.driverCard}>
          <View style={styles.row}><VimaText variant="h3" style={styles.fill}>{assignment.driver.name}</VimaText>
            <VimaText variant="bodyMedium">★ {assignment.driver.rating}</VimaText></View>
          <View style={styles.pin}><VimaText variant="caption">PIN</VimaText>
            <VimaText variant="h1" selectable accessibilityLabel={`PIN ${assignment.pin.split('').join(' ')}`}>{assignment.pin}</VimaText></View>
          <View style={styles.vehicle}>
            {boundaries.vehicleImage ? <Image source={boundaries.vehicleImage} style={styles.vehicleImage} resizeMode="contain" />
              : <View style={styles.vehicleImage} accessibilityLabel="Imagen del vehículo no disponible" />}
            <View style={styles.fill}><VimaText variant="bodyMedium">{assignment.vehicle.name}</VimaText>
              <VimaText variant="bodySmall">{assignment.vehicle.color}</VimaText>
              <VimaText variant="bodyMedium" selectable>{assignment.vehicle.plate}</VimaText></View>
          </View>
        </View>
        <View style={styles.row}><VimaButton style={styles.fill} secondary communication label="Llamar" onPress={() => boundaries.call(assignment)} disabled={blocked} />
          <VimaButton style={styles.fill} secondary label="Seguridad" onPress={() => boundaries.safety(assignment)} /></View>
        <TextAction label="Cancelar viaje" onPress={() => { void flow.act('cancel'); }} disabled={blocked} />
      </> : matching ? <>
        <View onLayout={(event) => { pulseHeight.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height;
          setPulseVisible(scrollOffset.current < pulseHeight.current); }}>
          <SearchPulse visible={focused && pulseVisible} expanded={flow.phase === 'expanding'} />
        </View>
        <VimaText variant="h3" style={styles.matchingTitle}>{flow.phase === 'prolonged'
          ? 'Aún buscamos un conductor' : 'Buscando un conductor\ncerca de ti...'}</VimaText>
        <VimaText variant="bodySmall" style={[styles.center, styles.muted]}>{flow.phase === 'prolonged'
          ? 'Puede tomar unos minutos más.\nPuedes editar, programar o cancelar.' : flow.phase === 'expanding'
            ? 'Puede tomar unos minutos más.' : 'Te conectaremos con el conductor más cercano disponible.'}</VimaText>
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
    </ScrollView>
  </Animated.View>;
  return <SafeAreaView edges={inset ? undefined : []} style={styles.fill}>
    <View onTouchStart={dismissKeyboard} style={styles.top}>
      {flow.phase === 'home' && !flow.field && !reviewing ? <>
        <View style={styles.headerSide}><VimaGlyph name="menu" /></View>
        <View pointerEvents="none" style={styles.headerLockupSlot}>
          <Image source={require('../../../assets/brand/vima_header_lockup_final.png')} style={styles.headerLockup}
            resizeMode="contain" accessibilityLabel="Vima" />
        </View>
        <View style={styles.headerSide}><VimaGlyph name="profile" /></View>
      </>
        : <>{matching ? <View style={styles.headerSide}><VimaGlyph name="menu" /></View>
          : <Pressable accessibilityRole="button" accessibilityLabel="Volver" disabled={flow.phase === 'requesting' || !!assignment}
            onPress={goBack} style={styles.headerSide}><VimaGlyph name="back" /></Pressable>}
          <VimaText variant={assignment ? 'h2' : 'h3'} style={styles.headerTitle} accessibilityRole="header">
            {assignment ? 'Tu conductor va en camino' : matching ? 'Buscando un conductor' : reviewing ? '' : flow.field ? '' : 'Confirma tu viaje'}
          </VimaText><View style={styles.headerSide}>{matching ? <VimaGlyph name="profile" /> : null}</View></>}
    </View>
    <View style={styles.fill} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <PassengerRideShell trip={flow.trip}
        map={{ onRegionDidChange: event => {
          const target = pendingCenter.current;
          if (target && !event.nativeEvent.userInteraction && event.nativeEvent.center.every((value, i) => Math.abs(value - target[i]!) < 0.00001)) {
            pendingCenter.current = null; setRecentering(false); setCentered(true); void semanticHaptics('pinCorrect');
          }
        }, onTouchStart: () => { pendingCenter.current = null; setRecentering(false); dismissKeyboard(); setMapUserControlled(true); },
          onPress: event => { setIncident(null); if (pickingMap) setSelectedCoordinate(normalizeCoordinate(event.nativeEvent.lngLat)); },
          onDidFinishLoadingMap: () => { setMapReady(true); setMapFailed(false); }, onDidFailLoadingMap: () => setMapFailed(true) }}
        mapContent={<PassengerMap quote={flow.quote} assignment={assignment} origin={flow.origin} destination={flow.destination}
          currentLocation={flow.currentLocation} onIncidentSelect={pickingMap ? undefined : setIncident}
          home={flow.phase === 'home' && !flow.destination}
          ready={mapReady} searchPresentationActive={flow.field !== null}
          recenter={recenter} layers={mapLayers} displayKeyAvailable={hasDisplayKey} active={focused}
          manualSelection={pickingMap && selectedCoordinate ? { coordinate: selectedCoordinate,
            kind: flow.field === 'origin' && searchAction === 'map' ? 'origin' : 'destination' } : null}
          cameraMode={mapUserControlled ? 'user-controlled' : 'automatic'} config={mapConfig}
          sheetHeight={interaction ? height - interaction.targetOffset : height * t.components.bottomSheetSnapPointsPercent[snap]! / 100} />}
        sheet={{ interaction, header, style: styles.sheet }} renderPhase={() => content} />
      {mapReady && (interaction?.targetOffset ?? height) > 130 ? <View pointerEvents="box-none"
        style={[styles.mapControls, { bottom: height - (interaction?.targetOffset ?? height) + t.spacing.scalePx[2]! }]}>
        <MapControls available={hasDisplayKey} canRecenter={!!flow.currentLocation} layers={mapLayers}
          recentering={recentering} centered={centered} open={layersOpen} onRecenter={recenterMap} onOpen={() => setLayersOpen((value) => !value)} onToggle={toggleMapLayer} />
      </View> : null}
      {incident && (interaction?.targetOffset ?? height) > 100 ? <IncidentCard details={incident}
        maxHeight={Math.min(200, (interaction?.targetOffset ?? height) - 24)} onClose={() => setIncident(null)} /> : null}
      {mapFailed ? <VimaText variant="caption" style={styles.mapStatus}>Mapa · !</VimaText> : null}
    </View>
    <VimaLaunchSurface active={focused} ready={mapReady || mapFailed} />
  </SafeAreaView>;
}

function SmallPin({ color }: { color: string }) {
  return <View accessible={false} style={styles.pinBox}><View style={[styles.pinShape, { backgroundColor: color }]} /><View style={styles.pinCore} /></View>;
}
function MatchingProgress() {
  return <View accessible={false} style={styles.progress}>
    <View style={styles.progressActive} /><View style={styles.progressDot} /><View style={styles.progressRest} />
    <View style={styles.progressIdle} /><View style={styles.progressIdle} />
  </View>;
}
function OriginField({ place, status, onPress }: { place: Place | null; status: OriginStatus; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Origen" onPress={onPress} style={styles.originField}>
    <View style={styles.originDot} />
    <View style={styles.fill}>
      <VimaText variant="caption" style={styles.muted}>Origen</VimaText>
      <VimaText variant="bodySmall">{status === 'loading' ? 'Obteniendo tu ubicación...' : status === 'unavailable'
        ? 'No se pudo obtener tu ubicación' : status === 'automatic' ? 'Tu ubicación actual' : place?.name}</VimaText>
      {place?.address ? <VimaText variant="caption" style={styles.muted} numberOfLines={1}>{place.address}</VimaText> : null}
    </View>
    <VimaGlyph name="chevron" />
  </Pressable>;
}
function AddressField({ label, place, color, onPress, disabled }: { label: string; place?: Place | null; color: string; onPress?: () => void; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={`${label} ${place?.name ?? ''}`} style={styles.address}>
    <SmallPin color={color} />
    <View style={styles.fill}><VimaText variant="caption" style={styles.addressLabel}>{label}</VimaText>
      <VimaText variant="bodySmall" style={!place && styles.muted} numberOfLines={1}>{place?.name ?? label}</VimaText>
      {place ? <VimaText variant="caption" style={styles.muted} numberOfLines={1}>{place.address}</VimaText> : null}</View>
  </Pressable>;
}
function PlaceRow({ place, onPress }: { place: PlaceSuggestion; onPress: () => void }) {
  const lower = place.name.toLowerCase();
  const glyph: VimaGlyphName = lower.includes('casa') ? 'home' : lower.includes('trabajo') ? 'work' : 'route';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${place.name}, ${place.address}`} onPress={onPress} style={styles.recent}>
    <View style={styles.recentIcon}><VimaGlyph name={glyph} /></View>
    <View style={styles.fill}><VimaText variant="bodyMedium">{place.name}</VimaText>
      <VimaText variant="bodySmall" style={styles.muted} numberOfLines={1}>{place.address}</VimaText></View>
    <VimaGlyph name="chevron" color={t.colors.gray} />
  </Pressable>;
}
function QuickPlace({ label, icon, onPress }: { label: string; icon: VimaGlyphName; onPress?: () => void }) {
  const content = <><VimaGlyph name={icon} /><VimaText variant="caption">{label}</VimaText></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.quickPlace}>{content}</Pressable>
    : <View accessible accessibilityLabel={label} style={styles.quickPlace}>{content}</View>;
}
function Metric({ icon, value, label }: { icon: VimaGlyphName; value: string; label: string }) {
  return <View style={styles.metric}><VimaGlyph name={icon} /><VimaText variant="bodyMedium" numberOfLines={1}>{value}</VimaText>
    <VimaText variant="caption" style={styles.muted}>{label}</VimaText></View>;
}
function TextAction({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
    onPress={() => { void semanticHaptics('buttonChip'); onPress(); }} style={styles.textAction}>
    <VimaText variant="bodySmall" style={[styles.center, disabled && styles.muted]}>{label}</VimaText></Pressable>;
}

const [xs, sm, md, lg, base] = t.spacing.scalePx as [number, number, number, number, number];
const styles = StyleSheet.create({
  fill: { flex: 1 }, center: { textAlign: 'center' }, muted: { color: t.colors.gray },
  top: { height: t.components.buttonPrimary.heightPx, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'relative',
    paddingHorizontal: t.spacing.mobileHorizontalMarginPx, backgroundColor: t.colors.white },
  headerLockupSlot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // Uniform scaling of the v2 master's visible bounds (672 × 200 raster derivative).
  headerLockup: { width: 672 * 28 / 200, height: 28 },
  headerSide: { width: t.components.iconSizesPx[2], justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', color: t.colors.carbon },
  sheet: { overflow: 'hidden', elevation: 3 },
  sheetHeader: { paddingHorizontal: base, alignItems: 'center', paddingTop: sm, paddingBottom: md, gap: sm },
  handle: { width: t.spacing.scalePx[7], height: t.spacing.scalePx[0], borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight },
  content: { paddingHorizontal: t.spacing.mobileHorizontalMarginPx, paddingBottom: base, gap: md },
  originField: { minHeight: t.components.inputPrimary.heightPx, flexDirection: 'row', alignItems: 'center', gap: md },
  originDot: { width: sm, height: sm, borderRadius: t.radii.pillPx, backgroundColor: t.colors.green },
  row: { flexDirection: 'row', alignItems: 'center', gap: md },
  homeSearch: { height: t.components.inputPrimary.heightPx, borderRadius: t.radii.fieldPx, backgroundColor: t.colors.background,
    flexDirection: 'row', alignItems: 'center', gap: md, paddingHorizontal: md },
  quickRow: { flexDirection: 'row', gap: sm },
  quickPlace: { flex: 1, height: t.components.buttonPrimary.heightPx + t.spacing.scalePx[2]!, alignItems: 'center', justifyContent: 'center',
    gap: xs, borderRadius: t.radii.fieldPx, backgroundColor: t.colors.white, borderWidth: t.borders.standardWidthPx, borderColor: t.colors.background },
  recentHeader: { flexDirection: 'row', alignItems: 'center', marginTop: xs },
  recent: { minHeight: t.components.buttonPrimary.heightPx + sm, flexDirection: 'row', alignItems: 'center', gap: md,
    paddingVertical: sm, borderBottomWidth: t.borders.standardWidthPx, borderBottomColor: t.colors.background },
  recentIcon: { width: t.spacing.scalePx[7], height: t.spacing.scalePx[7], alignItems: 'center', justifyContent: 'center',
    borderRadius: t.radii.smallPx, backgroundColor: t.colors.background },
  pinBox: { width: t.components.iconSizesPx[1], height: t.components.iconSizesPx[1], alignItems: 'center', justifyContent: 'center' },
  pinShape: { width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    borderBottomRightRadius: t.radii.smallPx / 2, transform: [{ rotate: '45deg' }] },
  pinCore: { position: 'absolute', width: xs, height: xs, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white, top: sm, left: sm },
  addressGroup: { backgroundColor: t.colors.white, borderRadius: t.radii.cardPx },
  confirmAddressGroup: { marginHorizontal: md },
  address: { minHeight: t.components.inputPrimary.heightPx, flexDirection: 'row', alignItems: 'center', gap: md, paddingVertical: sm },
  addressRule: { marginLeft: t.components.iconSizesPx[1]! + md, height: t.borders.standardWidthPx, backgroundColor: t.colors.background },
  addressLabel: { color: t.colors.graphite },
  metrics: { flexDirection: 'row', alignItems: 'center', borderRadius: t.radii.fieldPx, backgroundColor: t.colors.background,
    paddingVertical: md },
  metric: { flex: 1, alignItems: 'center', gap: xs },
  paymentRow: { minHeight: t.components.inputPrimary.heightPx, flexDirection: 'row', alignItems: 'center', gap: md,
    paddingHorizontal: md, borderTopWidth: t.borders.standardWidthPx, borderColor: t.colors.background },
  searchFocused: { borderColor: t.colors.greenDark },
  searchField: { borderWidth: t.borders.standardWidthPx, borderColor: t.borders.standardColor, height: t.components.inputPrimary.heightPx, borderRadius: t.radii.fieldPx, backgroundColor: t.colors.background,
    paddingHorizontal: md, flexDirection: 'row', alignItems: 'center', gap: sm },
  searchInput: { ...textStyle({ variant: 'body', weight: 400 }), flex: 1, height: t.components.inputPrimary.heightPx, color: t.colors.carbon },
  contributionInput: { ...textStyle({ variant: 'body', weight: 400 }), height: t.components.inputPrimary.heightPx,
    borderRadius: t.radii.fieldPx, borderWidth: t.borders.standardWidthPx, borderColor: t.colors.grayLight,
    paddingHorizontal: md, color: t.colors.carbon },
  searchSkeleton: { height: t.components.buttonPrimary.heightPx, justifyContent: 'center', gap: sm, paddingHorizontal: md },
  skeletonLine: { width: '62%', height: sm, borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight },
  skeletonLineShort: { width: '40%', height: xs, borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight },
  matchingActions: { flexDirection: 'row', alignItems: 'center', gap: sm },
  matchingTitle: { textAlign: 'center', alignSelf: 'center', maxWidth: '88%' },
  progress: { height: t.components.iconSizesPx[1], flexDirection: 'row', alignItems: 'center', marginVertical: sm },
  progressActive: { flex: 1, height: t.borders.standardWidthPx * 2, backgroundColor: t.colors.greenDark },
  progressDot: { width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.greenDark, borderWidth: t.borders.standardWidthPx * 2, borderColor: t.colors.white },
  progressRest: { flex: 1, height: t.borders.standardWidthPx * 2, backgroundColor: t.colors.grayLight },
  progressIdle: { width: t.spacing.scalePx[2], height: t.spacing.scalePx[2], borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.grayLight, marginLeft: md },
  textAction: { paddingVertical: sm }, notice: { backgroundColor: t.colors.background, paddingHorizontal: base, paddingVertical: sm },
  driverCard: { gap: lg, padding: lg, borderRadius: t.radii.cardPx, backgroundColor: t.colors.background },
  pin: { alignItems: 'center', paddingVertical: sm, gap: xs }, vehicle: { flexDirection: 'row', alignItems: 'center', gap: lg },
  vehicleImage: { flex: 1, aspectRatio: 1, borderRadius: t.radii.fieldPx, backgroundColor: t.colors.grayLight, justifyContent: 'center', padding: sm },
  mapStatus: { position: 'absolute', top: lg, alignSelf: 'center', backgroundColor: t.colors.white, padding: sm, borderRadius: t.radii.pillPx },
  mapControls: { position: 'absolute', right: t.spacing.mobileHorizontalMarginPx },
});
