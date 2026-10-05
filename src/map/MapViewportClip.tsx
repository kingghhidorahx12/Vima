import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/** Native Marker views must be clipped at the physical map boundary, outside MapLibre. */
export function MapViewportClip({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View collapsable={false} style={[styles.viewport, style]}>{children}</View>;
}

const styles = StyleSheet.create({ viewport: { flex: 1, overflow: 'hidden' } });
