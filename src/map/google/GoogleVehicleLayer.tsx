import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useVehicleMotion } from '../useVehicleMotion';
import type { VehicleLayerProps } from '../VehicleLayer';
import type { VehiclePose } from '../vehicleMotion';
import { googleCoordinate } from './camera';

export function GoogleVehicleLayer({ id, sample, motion, appearance: a }: VehicleLayerProps) {
  const pose = useVehicleMotion(sample, motion);
  const ref = useRef<ComponentRef<typeof Marker>>(null);
  const latest = useRef<VehiclePose | null>(null);
  const [initial, setInitial] = useState<VehiclePose | null>(null);
  const [laidOut, setLaidOut] = useState(false);
  const applyPose = useCallback((next: VehiclePose | null) => {
    const wasVisible = latest.current !== null;
    latest.current = next;
    // React only mounts/unmounts the marker. The existing 12 Hz loop updates native props.
    if (!next || !wasVisible) { setInitial(next); setLaidOut(false); }
    if (next && ref.current) {
      ref.current.setCoordinates(googleCoordinate(next.coordinate));
      ref.current.setNativeProps({ rotation: next.heading });
    }
  }, []);
  useAnimatedReaction(() => pose.get(), next => { scheduleOnRN(applyPose, next); });
  if (!initial) return null;
  return <Marker ref={ref} identifier={id} coordinate={googleCoordinate(initial.coordinate)}
    rotation={initial.heading} flat anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={!laidOut}
    onLayout={() => { applyPose(latest.current); ref.current?.redraw(); setLaidOut(true); }}>
    <View style={{ width: a.radius * 2, height: a.radius * 2, borderRadius: a.radius,
      backgroundColor: a.color, borderWidth: a.strokeWidth, borderColor: a.strokeColor }} />
  </Marker>;
}
