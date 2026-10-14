import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Camera } from '../../map/Camera';
import type { CameraTarget } from '../../map/models';
import { DriverVehicleMarker } from '../../map/DriverVehicleMarker';
import { RouteLayer } from '../../map/RouteLayer';
import { TrafficFlowLayer } from '../../map/TrafficFlowLayer';
import { IncidentLayer } from '../../map/IncidentLayer';
import { MapPlacePin } from '../../map/MapPlacePin';
import { MapControl, MapControls } from '../passenger/MapControls';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { useVimaTheme } from '../../design/themes';
import { elevationStyle } from '../../design/themes/light';
import { MapCompass } from '../passenger/MapCompass';
import { VimaThemeToggle } from '../../design/components/VimaThemeToggle';
import { mapLayerStorage } from '../../services/storage/mapLayers';
import { defaultTrafficLayers, mapLayerCapabilities } from '../../map/traffic';
import { advanceDriverCamera, initialDriverCameraIntent, driverMapContent } from './driverMapModel';
import type { DriverState } from '../../services/matching/contracts';
import type { VimaMapProps } from '../../map/VimaMap';

export function useDriverMap(state: DriverState | undefined, online: boolean, viewport?: { height: number; sheetHeight: number }) {
  const theme = useVimaTheme();
  const [controlledTarget, setControlledTarget] = useState<CameraTarget>();
  const [recenter, setRecenter] = useState<{ coordinate: readonly [number, number]; sequence: number }>();
  const [camera, setCamera] = useState(() => ({ state, intent: advanceDriverCamera(initialDriverCameraIntent, state) }));
  // Reconcile authority before committing children; no effect-driven second camera render.
  let intent = camera.intent;
  if (camera.state !== state) {
    intent = advanceDriverCamera(camera.intent, state);
    setCamera({ state, intent });
  }
  const viewportSheetHeight = viewport?.sheetHeight;
  const target = useMemo(() => ({ ...intent.target, padding: viewportSheetHeight !== undefined
    ? { top: 112, bottom: viewportSheetHeight + 40, left: 32, right: 76 } : intent.target.padding }),
    [intent.target, viewportSheetHeight]);
  const [layers, setLayers] = useState(defaultTrafficLayers);
  const [open, setOpen] = useState(false); const [bearing, setBearing] = useState(0);
  const [ready, setReady] = useState(false); const [failed, setFailed] = useState(false); const [north, setNorth] = useState<number>();
  const capabilities = mapLayerCapabilities(process.env.EXPO_PUBLIC_TOMTOM_DISPLAY_KEY);
  useEffect(() => { let active = true; void mapLayerStorage.read().then(value => { if (active) setLayers(value); }); return () => { active = false; }; }, []);
  const map = useMemo<VimaMapProps>(() => ({ compass: false, onDidFinishLoadingMap: () => { setReady(true); setFailed(false); },
    onDidFailLoadingMap: () => setFailed(true), onTouchStart: () => setControlledTarget(intent.target),
    onRegionIsChanging: event => { if (Number.isFinite(event.nativeEvent.bearing)) setBearing(event.nativeEvent.bearing); },
    onRegionDidChange: event => { if (Number.isFinite(event.nativeEvent.bearing)) setBearing(event.nativeEvent.bearing); },
  }), [intent.target]);
  const content = driverMapContent(state);
  return { map, mapContent: <>
    <Camera target={target} initialTarget={intent.target} ready={ready && (!viewport || viewport.height > 0)}
      mode={controlledTarget === intent.target ? 'user-controlled' : 'automatic'}
      recenter={ready ? recenter : undefined} recenterPadding={target.padding} northRequest={ready ? north : undefined} />
    {capabilities.traffic ? <TrafficFlowLayer enabled={layers.traffic} /> : null}
    {capabilities.incidents ? <IncidentLayer enabled={layers.incidents} /> : null}
    {content.route ? <RouteLayer id="driver-pickup-route" data={content.route} state="active" activeTone="accentBlue"
      appearance={{ width: 4, opacity: 1, cap: 'round', join: 'round' }} /> : null}
    {content.pickup ? <MapPlacePin place={content.pickup} kind="origin" id="driver-pickup" /> : null}
    <DriverVehicleMarker key={state?.accountId} location={content.location} sequence={state?.revision ?? 0} online={online} />
  </>, mapOverlay: <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <View testID="driver-top-left-chrome" pointerEvents="box-none" style={styles.brand}>
      <Image source={require('../../../assets/brand/vima_header_lockup_final.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Vima" />
      <VimaThemeToggle touchSize={44} />
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Notificaciones" disabled accessibilityState={{ disabled: true }}
      style={[styles.notifications, { backgroundColor: theme.roles.elevatedSurface, ...elevationStyle('level2', theme.roles.shadow) }]}>
      <VimaGlyph name="notifications" color={theme.roles.control} />
    </Pressable>
    <View testID="driver-map-controls" pointerEvents="box-none" style={[styles.chrome, { bottom: (viewport?.sheetHeight ?? 0) + 12 }]}>
    <MapControl label="Centrar ubicación" icon="recenter" disabled={!ready || !content.location}
      onPress={() => { if (content.location) setRecenter(value => ({ coordinate: content.location!.coordinate, sequence: (value?.sequence ?? 0) + 1 })); }} />
    <MapControls available={capabilities.traffic || capabilities.incidents} capabilities={capabilities} layers={layers} open={open}
      compass={<MapCompass size={40} touchSize={44} bearing={bearing} ready={ready} onPress={() => setNorth(value => (value ?? 0) + 1)} />}
      onOpen={() => setOpen(value => !value)} onToggle={layer => {
        if (!capabilities[layer]) return;
        const next = { ...layers, [layer]: !layers[layer] }; setLayers(next); void mapLayerStorage.write(next).catch(() => {});
      }} />
    </View>
    {failed ? <View pointerEvents="none" style={[styles.notice, { backgroundColor: theme.roles.surface }]}>
      <VimaText variant="bodySmall">No se pudo cargar el mapa. Revisa tu conexión.</VimaText>
    </View> : null}
  </View> };
}
const styles = StyleSheet.create({
  chrome: { position: 'absolute', right: 16, alignItems: 'flex-end', gap: 8 },
  brand: { position: 'absolute', left: 16, top: 14, alignItems: 'flex-start', gap: 8 },
  logo: { width: 112, height: 32 },
  notifications: { position: 'absolute', right: 16, top: 8, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  notice: { position: 'absolute', top: 112, left: 16, right: 76, padding: 8, borderRadius: 12 },
});
