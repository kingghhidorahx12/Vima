import { useRef, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { VimaRideSheet, type VimaRideSheetProps } from '../../design/components/VimaRideSheet';
import { VimaGlassTargetProvider } from '../../design/components/VimaGlassSurface';
import { VimaMap, type VimaMapProps } from '../../map/VimaMap';
import { MapViewportClip } from '../../map/MapViewportClip';
import type { AuthoritativeTrip } from './contracts';
import { useTripUiStore } from './uiStore';

export interface RideShellProps {
  readonly trip?: AuthoritativeTrip;
  readonly map?: VimaMapProps;
  readonly mapContent?: ReactNode;
  readonly mapOverlay?: ReactNode;
  readonly mapViewportStyle?: StyleProp<ViewStyle>;
  readonly sheet?: Omit<VimaRideSheetProps, 'children' | 'enabled'>;
  readonly renderPhase: (trip: AuthoritativeTrip | undefined) => ReactNode;
}

export function RideShell({ trip, map, mapContent, mapOverlay, mapViewportStyle, sheet, renderPhase }: RideShellProps) {
  const interactionEnabled = useTripUiStore((state) => state.sheetInteractionEnabled);
  const blurTarget = useRef<View>(null);
  return (
    <VimaGlassTargetProvider target={blurTarget}>
      <View style={styles.fill}>
        <BlurTargetView ref={blurTarget} style={styles.fill}>
          <MapViewportClip style={mapViewportStyle}><VimaMap {...map}>{mapContent}</VimaMap></MapViewportClip>
        </BlurTargetView>
        {mapOverlay ? <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{mapOverlay}</View> : null}
        <VimaRideSheet {...sheet} enabled={interactionEnabled}>
          {renderPhase(trip)}
        </VimaRideSheet>
      </View>
    </VimaGlassTargetProvider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
