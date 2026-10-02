import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

/** Native Marker views must be clipped at the physical map boundary, outside MapLibre. */
export function MapViewportClip({ children }: PropsWithChildren) {
  return <View style={styles.viewport}>{children}</View>;
}

const styles = StyleSheet.create({ viewport: { flex: 1, overflow: 'hidden' } });
