import { Map, TransformRequestManager, type MapProps } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { resolveMapStyle } from './style';
import { resolveBasemapStyle } from './basemap';

export type { MapRef as VimaMapRef } from '@maplibre/maplibre-react-native';

export type VimaMapProps = Omit<MapProps, 'mapStyle' | 'attribution'> & { readonly basemapVariant?: 'light' | 'dark' };

/** The persistent Vima renderer. Orbis style/asset URLs enter only through map configuration. */
export function VimaMap({ style, basemapVariant = 'light', ...props }: VimaMapProps) {
  // Direct access is required for Expo's public environment inlining.
  const mapStyle = resolveBasemapStyle(resolveMapStyle(process.env.EXPO_PUBLIC_MAP_STYLE_URL, __DEV__), basemapVariant);
  const displayKey = process.env.EXPO_PUBLIC_TOMTOM_DISPLAY_KEY?.trim();
  const [credentialReady, setCredentialReady] = useState(!displayKey);
  useEffect(() => {
    if (!displayKey) return;
    let active = true;
    const id = TransformRequestManager.addHeader({ id: 'vima-tomtom-orbis-display', name: 'TomTom-Api-Key',
      value: displayKey, match: /^https:\/\/api\.tomtom\.com\/maps\/orbis\// });
    const languageId = TransformRequestManager.addHeader({ id: 'vima-tomtom-incidents-language', name: 'Accept-Language',
      value: 'es-ES', match: /^https:\/\/api\.tomtom\.com\/maps\/orbis\/traffic\/incidents\// });
    // Mount the native map after its first Orbis request can receive the display header.
    queueMicrotask(() => { if (active) setCredentialReady(true); });
    return () => { active = false; TransformRequestManager.removeHeader(languageId); TransformRequestManager.removeHeader(id); };
  }, [displayKey]);
  return credentialReady ? <Map {...props} mapStyle={mapStyle} attribution style={[styles.fill, style]} />
    : <View style={[styles.fill, style]} />;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
