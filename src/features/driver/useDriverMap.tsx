import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera } from '../../map/Camera';
import { DriverVehicleMarker } from '../../map/DriverVehicleMarker';
import { RouteLayer } from '../../map/RouteLayer';
import { TrafficFlowLayer } from '../../map/TrafficFlowLayer';
import { IncidentLayer } from '../../map/IncidentLayer';
import { MapPlacePin } from '../../map/MapPlacePin';
import { MapControls } from '../passenger/MapControls';
import { MapCompass } from '../passenger/MapCompass';
import { VimaThemeToggle } from '../../design/components/VimaThemeToggle';
import { mapLayerStorage } from '../../services/storage/mapLayers';
import { defaultTrafficLayers, mapLayerCapabilities } from '../../map/traffic';
import { advanceDriverCamera, initialDriverCameraIntent, driverMapContent } from './driverMapModel';
import type { DriverState } from '../../services/matching/contracts';
import type { VimaMapProps } from '../../map/VimaMap';

export function useDriverMap(state: DriverState | undefined, online: boolean) {
  const [camera, setCamera] = useState(() => ({ state, intent: advanceDriverCamera(initialDriverCameraIntent, state) }));
  // Reconcile authority before committing children; no effect-driven second camera render.
  let intent = camera.intent;
  if (camera.state !== state) {
    intent = advanceDriverCamera(camera.intent, state);
    setCamera({ state, intent });
  }
  const target = intent.target;
  const [layers, setLayers] = useState(defaultTrafficLayers);
  const [open, setOpen] = useState(false); const [bearing, setBearing] = useState(0);
  const [ready, setReady] = useState(false); const [north, setNorth] = useState<number>();
  const capabilities = mapLayerCapabilities(process.env.EXPO_PUBLIC_TOMTOM_DISPLAY_KEY);
  useEffect(() => { let active = true; void mapLayerStorage.read().then(value => { if (active) setLayers(value); }); return () => { active = false; }; }, []);
  const map = useMemo<VimaMapProps>(() => ({ onDidFinishLoadingMap: () => setReady(true),
    onRegionIsChanging: event => { if (Number.isFinite(event.nativeEvent.bearing)) setBearing(event.nativeEvent.bearing); },
    onRegionDidChange: event => { if (Number.isFinite(event.nativeEvent.bearing)) setBearing(event.nativeEvent.bearing); },
  }), []);
  const content = driverMapContent(state);
  return { map, mapContent: <>
    <Camera target={target} initialTarget={target} ready={ready} northRequest={north} />
    {capabilities.traffic ? <TrafficFlowLayer enabled={layers.traffic} /> : null}
    {capabilities.incidents ? <IncidentLayer enabled={layers.incidents} /> : null}
    {content.route ? <RouteLayer id="driver-pickup-route" data={content.route} state="active" activeTone="accentBlue"
      appearance={{ width: 4, opacity: 1, cap: 'round', join: 'round' }} /> : null}
    {content.pickup ? <MapPlacePin place={content.pickup} kind="origin" id="driver-pickup" /> : null}
    <DriverVehicleMarker location={content.location} sequence={state?.revision ?? 0} online={online} />
  </>, mapOverlay: <View pointerEvents="box-none" style={styles.chrome}>
    <VimaThemeToggle />
    <MapControls available={capabilities.traffic || capabilities.incidents} capabilities={capabilities} layers={layers} open={open}
      compass={<MapCompass bearing={bearing} ready={ready} onPress={() => setNorth(value => (value ?? 0) + 1)} />}
      onOpen={() => setOpen(value => !value)} onToggle={layer => {
        if (!capabilities[layer]) return;
        const next = { ...layers, [layer]: !layers[layer] }; setLayers(next); void mapLayerStorage.write(next).catch(() => {});
      }} />
  </View> };
}
const styles = StyleSheet.create({ chrome: { position: 'absolute', right: 16, top: 16, alignItems: 'flex-end', gap: 10 } });
