import { Map, TransformRequestManager, type MapProps } from '@maplibre/maplibre-react-native';
import { StyleSheet } from 'react-native';
import { mapTilerUserAgentHeader } from './requestPolicy';
import { resolveMapStyle } from './style';

// Register before Map mounts so its first style request is covered.
TransformRequestManager.addHeader(mapTilerUserAgentHeader);

export type VimaMapProps = Omit<MapProps, 'mapStyle' | 'attribution'>;

export function VimaMap({ style, ...props }: VimaMapProps) {
  // Direct access is required for Expo's public environment inlining.
  const mapStyle = resolveMapStyle(process.env.EXPO_PUBLIC_MAP_STYLE_URL, __DEV__);
  return <Map {...props} mapStyle={mapStyle} attribution style={[styles.fill, style]} />;
}

// Container geometry only; not a visual token or an approved P0 design.
const styles = StyleSheet.create({ fill: { flex: 1 } });
