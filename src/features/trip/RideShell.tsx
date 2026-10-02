import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { VimaRideSheet, type VimaRideSheetProps } from '../../design/components/VimaRideSheet';
import { VimaMap, type VimaMapProps } from '../../map/VimaMap';
import { MapViewportClip } from '../../map/MapViewportClip';
import type { AuthoritativeTrip } from './contracts';
import { useTripUiStore } from './uiStore';

export interface RideShellProps {
  readonly trip?: AuthoritativeTrip;
  readonly map?: VimaMapProps;
  readonly mapContent?: ReactNode;
  readonly sheet?: Omit<VimaRideSheetProps, 'children' | 'enabled'>;
  readonly renderPhase: (trip: AuthoritativeTrip | undefined) => ReactNode;
}

export function RideShell({ trip, map, mapContent, sheet, renderPhase }: RideShellProps) {
  const interactionEnabled = useTripUiStore((state) => state.sheetInteractionEnabled);
  return (
    <View style={styles.fill}>
      <MapViewportClip><VimaMap {...map}>{mapContent}</VimaMap></MapViewportClip>
      <VimaRideSheet {...sheet} enabled={interactionEnabled}>
        {renderPhase(trip)}
      </VimaRideSheet>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
