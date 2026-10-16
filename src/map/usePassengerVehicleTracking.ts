import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { advancePassengerTracking, passengerTrackingPresentation, passengerTrackingPolicy,
  type ObservedVehicleFix, type PassengerTrackingState } from './passengerVehicleTracking';
import type { Assignment } from '../features/passenger/model';

/** Assignment-scoped memory; timestamps drive status deadlines, never an animation clock. */
export function usePassengerVehicleTracking(identity: string | undefined, fix: ObservedVehicleFix | undefined, online: boolean) {
  const [memory, setMemory] = useState<{ identity?: string; state: PassengerTrackingState }>({ state: {} });
  const [clock, setClock] = useState(Date.now);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const connected = online && foreground;
  const now = clock;
  const current = identity && memory.identity === identity ? memory.state : {};
  const next = identity ? advancePassengerTracking(current, fix, connected, now) : current;
  if (memory.identity !== identity || next !== current) setMemory({ identity, state: next });
  const captured = next.visual?.fix.receivedAt;
  useEffect(() => {
    // Observe receipt time on the clock's task, rather than deriving time during React render.
    // One cancellable tick per incoming sample/context change, not an animation or network poll.
    const receipt = setTimeout(() => setClock(Date.now()), 0);
    return () => clearTimeout(receipt);
  }, [identity, fix?.sequence, fix?.receivedAt, online]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active'); setClock(Date.now());
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (captured === undefined) return;
    const refresh = () => setClock(Date.now());
    const age = Math.max(0, Date.now() - captured);
    const delay = age < passengerTrackingPolicy.recentMs ? passengerTrackingPolicy.recentMs - age
      : age < passengerTrackingPolicy.expiredMs ? Math.min(10_000, passengerTrackingPolicy.expiredMs - age) : 30_000;
    const timer = setTimeout(refresh, Math.max(1, delay));
    return () => clearTimeout(timer);
  }, [captured, clock]);
  return passengerTrackingPresentation(next, connected, now);
}

export function usePassengerAssignmentTracking(assignment: Assignment | undefined, phase: string | undefined, online: boolean) {
  const sample = assignment?.sample;
  const visible = !!assignment && sample?.capturedAt !== undefined && ['ASSIGNED', 'ARRIVED_PICKUP', 'IN_PROGRESS'].includes(phase ?? '');
  return usePassengerVehicleTracking(visible ? assignment.id : undefined, visible ? {
    coordinate: sample.coordinate, receivedAt: sample.capturedAt!, sequence: sample.sequence,
    ...(sample.headingKnown !== false ? { heading: sample.heading } : {}),
  } : undefined, online);
}
