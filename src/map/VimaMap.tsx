import { Map, type MapProps } from '@maplibre/maplibre-react-native';
import { StyleSheet } from 'react-native';
import { resolveMapStyle } from './style';

export type VimaMapProps = Omit<MapProps, 'mapStyle' | 'attribution'>;

/** The persistent Vima renderer. Orbis style/asset URLs enter only through map configuration. */
export function VimaMap({ style, ...props }: VimaMapProps) {
  // Direct access is required for Expo's public environment inlining.
  const mapStyle = resolveMapStyle(process.env.EXPO_PUBLIC_MAP_STYLE_URL, __DEV__);
  return <Map {...props} mapStyle={mapStyle} attribution style={[styles.fill, style]} />;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
