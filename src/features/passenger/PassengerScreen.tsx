import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View, type ImageSourcePropType } from 'react-native';
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
import { motionTimings } from '../../motion/timing';
import { PassengerMap, type PassengerMapConfig } from './PassengerMap';
import { PassengerRideShell } from './PassengerRideShell';
import { isMatching, validDraft, type Assignment, type OriginStatus, type PassengerGateway, type Place, type RideQuote } from './model';
import { usePassengerFlow } from './usePassengerFlow';
import type { PlaceSuggestion } from '../../services/geospatial/contracts';

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
  const draftKey = `${flow.origin?.id ?? ''}:${flow.destination?.id ?? ''}`;
  const reviewing = (flow.phase === 'confirm' && reviewedDraft !== draftKey) || (flow.phase === 'home' && !!flow.destination);
  const snap: SheetSnap = flow.field ? 2 : 1;
  const measureKey = `${flow.phase}:${flow.field ?? ''}:${reviewing}`;
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
  const sheetTitle = flow.field ? flow.field === 'origin' ? '¿Desde dónde?' : '¿A dónde vas?'
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
  const openField = (target: 'origin' | 'destination') => { setMapUserControlled(false); flow.openField(target); };
  const openSearch = (query = '') => { dismissKeyboard(); openField('destination'); flow.setSearch(query); };
  const choosePlace = (place: Place | PlaceSuggestion, target?: 'origin' | 'destination') => {
    dismissKeyboard(); setMapUserControlled(false); void flow.choosePlace(place, target);
  };
  const money = (amount: number, currency: string) => new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  const content = <Animated.View style={[styles.fill, animatedContent]}>
    {flow.connection !== 'online' ? <VimaText variant="caption" accessibilityLiveRegion="polite" style={styles.notice}>Sin conexión · Intentando reconectar</VimaText> : null}
    {flow.error ? <Pressable onPress={flow.retry} accessibilityRole="button" accessibilityLabel={flow.error.message}>
      <VimaText variant="caption" accessibilityLiveRegion="polite" style={styles.notice}>{flow.error.message} ↻</VimaText>
    </Pressable> : null}
    <ScrollView ref={scroll} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
      onTouchStart={dismissKeyboard} onScrollBeginDrag={dismissKeyboard}
      contentContainerStyle={styles.content}
      onContentSizeChange={(_width, contentHeight) => setContentMeasure((previous) => previous?.key === measureKey && previous.height === contentHeight
        ? previous : { key: measureKey, height: contentHeight })}
      onScroll={(event) => { scrollOffset.current = event.nativeEvent.contentOffset.y; setPulseVisible(scrollOffset.current < pulseHeight.current); }}>
      {flow.field ? <>
        <View style={styles.searchField}><SmallPin color={t.colors.red} />
          <TextInput ref={input} autoFocus onTouchStart={(event) => event.stopPropagation()} accessibilityLabel={sheetTitle} placeholder="Buscar un lugar o dirección" value={flow.search}
            onChangeText={flow.setSearch} onSubmitEditing={() => { dismissKeyboard(); void flow.submitSearch(); }} returnKeyType="search"
            style={styles.searchInput} placeholderTextColor={t.colors.gray} />
          {flow.loadingPlaces ? <ActivityIndicator size="small" color={t.colors.greenDark} /> : null}</View>
        {flow.search.trim() ? <>
          {flow.places.map((place) => <PlaceRow key={place.id} place={place} onPress={() => choosePlace(place)} />)}
          {flow.loadingPlaces && !flow.places.length ? <View accessible accessibilityLabel="Buscando lugares" style={styles.searchSkeleton}>
            <View style={styles.skeletonLine} /><View style={styles.skeletonLineShort} />
          </View> : null}
        </> : <>
          {flow.favorites.length ? <><VimaText variant="bodyMedium">Favoritos</VimaText>
            {flow.favorites.map(place => <PlaceRow key={place.id} place={place} onPress={() => choosePlace(place)} />)}</> : null}
          {flow.recents.length ? <><VimaText variant="bodyMedium">Recientes</VimaText>
            {flow.recents.map(place => <PlaceRow key={place.id} place={place} onPress={() => choosePlace(place)} />)}</> : null}
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
            <Metric icon="payment" value={flow.quote.price ? money(flow.quote.price.amount, flow.quote.price.currency) : '—'} label="Precio estimado" />
          </View>
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
          : <Pressable accessibilityRole="button" accessibilityLabel="Volver" disabled={(reviewing && !flow.field) || flow.phase === 'requesting' || !!assignment}
            onPress={flow.field ? flow.closeField : () => { void edit(); }} style={styles.headerSide}><VimaGlyph name="back" /></Pressable>}
          <VimaText variant={assignment ? 'h2' : 'h3'} style={styles.headerTitle} accessibilityRole="header">
            {assignment ? 'Tu conductor va en camino' : matching ? 'Buscando un conductor' : reviewing ? '' : flow.field ? '' : 'Confirma tu viaje'}
          </VimaText><View style={styles.headerSide}>{matching ? <VimaGlyph name="profile" /> : null}</View></>}
    </View>
    <View style={styles.fill} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
      <PassengerRideShell trip={flow.trip}
        map={{ onTouchStart: () => { dismissKeyboard(); setMapUserControlled(true); },
          onDidFinishLoadingMap: () => { setMapReady(true); setMapFailed(false); }, onDidFailLoadingMap: () => setMapFailed(true) }}
        mapContent={<PassengerMap quote={flow.quote} assignment={assignment} origin={flow.origin} destination={flow.destination}
          currentLocation={flow.currentLocation}
          home={flow.phase === 'home' && !flow.destination}
          ready={mapReady} searchPresentationActive={flow.field !== null}
          cameraMode={mapUserControlled ? 'user-controlled' : 'automatic'} config={mapConfig}
          sheetHeight={interaction ? height - interaction.targetOffset : height * t.components.bottomSheetSnapPointsPercent[snap]! / 100} />}
        sheet={{ interaction, header, style: styles.sheet }} renderPhase={() => content} />
      {!mapReady && !mapFailed ? <View pointerEvents="none" style={styles.mapStatus}><ActivityIndicator accessibilityLabel="Mapa" color={t.colors.greenDark} /></View> : null}
      {mapFailed ? <VimaText variant="caption" style={styles.mapStatus}>Mapa · !</VimaText> : null}
    </View>
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
  sheet: { overflow: 'hidden' },
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
  searchField: { height: t.components.inputPrimary.heightPx, borderRadius: t.radii.fieldPx, backgroundColor: t.colors.background,
    paddingHorizontal: md, flexDirection: 'row', alignItems: 'center', gap: sm },
  searchInput: { ...textStyle({ variant: 'body', weight: 400 }), flex: 1, height: t.components.inputPrimary.heightPx, color: t.colors.carbon },
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
});
