import Constants from 'expo-constants';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, type ViewProps } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { VimaMap as LegacyMap } from './legacy/VimaMap';
import { MapContext } from './MapContext';
import type { MapPadding } from './models';
import { optionalGoogleMapId, resolveMapProvider } from './provider';

export interface VimaMapProps {
  children?: ReactNode; style?: ViewProps['style']; onTouchStart?: ViewProps['onTouchStart'];
  onDidFinishLoadingMap?: () => void; onDidFailLoadingMap?: () => void;
}
export function VimaMap({ children, style, onTouchStart, onDidFinishLoadingMap, onDidFailLoadingMap }: VimaMapProps) {
  const provider = resolveMapProvider(Platform.OS, Constants.expoConfig?.extra?.googleMapsAndroidConfigured === true, __DEV__);
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const failureCallback = useRef(onDidFailLoadingMap);
  useEffect(() => { failureCallback.current = onDidFailLoadingMap; }, [onDidFailLoadingMap]);
  const [padding, setPadding] = useState<MapPadding>({});
  const context = useMemo(() => ({ provider, map, ready, padding, setPadding }), [provider, ready, padding]);
  useEffect(() => {
    if (__DEV__ && Platform.OS === 'android' && provider === 'maplibre') {
      console.warn('Vima map: Maps Android key missing at build configuration; using transitional MapLibre DEV rollback.');
    }
  }, [provider]);
  useEffect(() => {
    if (provider !== 'google' || tilesLoaded) return;
    // Technical load deadline, not a motion/product timing. Native auth failures have no JS event.
    const timer = setTimeout(() => failureCallback.current?.(), 15000);
    return () => clearTimeout(timer);
  }, [provider, tilesLoaded]);
  const loaded = () => { setReady(true); setTilesLoaded(true); onDidFinishLoadingMap?.(); };
  return <MapContext.Provider value={context}>
    {provider === 'google' ? <MapView ref={map} provider={PROVIDER_GOOGLE}
      googleMapId={optionalGoogleMapId(process.env.EXPO_PUBLIC_GOOGLE_MAP_ID)}
      style={[styles.fill, style]} onTouchStart={onTouchStart} onMapReady={() => setReady(true)} onMapLoaded={loaded}
      mapPadding={{ top: padding.top ?? 0, right: padding.right ?? 0, bottom: padding.bottom ?? 0, left: padding.left ?? 0 }}
      showsUserLocation={false} showsMyLocationButton={false} toolbarEnabled={false}>
      {children}
    </MapView> : <LegacyMap style={style} onTouchStart={onTouchStart}
      onDidFinishLoadingMap={loaded} onDidFailLoadingMap={onDidFailLoadingMap}>{children}</LegacyMap>}
  </MapContext.Provider>;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
