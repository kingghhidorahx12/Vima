import { useAnimatedReaction, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { canInterpolateVehicle, interpolateVehiclePose, validateVehicleSample, vehicleUpdatesPerSecond,
  type VehiclePose, type VehicleMotionConfig, type VehicleSample } from './vehicleMotion';

/** Incoming telemetry writes sample.value; React is not part of the visual loop. */
export function useVehicleMotion(sample: SharedValue<VehicleSample | null>, config?: VehicleMotionConfig) {
  const { reducedMotion } = useMotionPolicy();
  const pose = useSharedValue<VehiclePose | null>(null);
  const target = useSharedValue<VehiclePose | null>(null);
  const origin = useSharedValue<VehiclePose | null>(null);
  const sequence = useSharedValue<number | null>(null);
  const started = useSharedValue<number | null>(null);
  const lastUpdate = useSharedValue<number | null>(null);
  const active = useSharedValue(false);

  useAnimatedReaction(() => ({ sample: sample.get(), reducedMotion }), (next, previous) => {
    if (next.sample === null) {
      active.set(false);
      pose.set(null);
      target.set(null);
      origin.set(null);
      sequence.set(null);
      return;
    }
    if ((next.reducedMotion || !config) && target.get()) {
      active.set(false);
      pose.set(target.get());
    }
    const incoming = next.sample;
    if (!incoming || !validateVehicleSample(incoming) || incoming === previous?.sample) return;
    const lastSequence = sequence.get();
    if (!incoming.reconnected && lastSequence !== null && incoming.sequence <= lastSequence) return;
    sequence.set(incoming.sequence);
    target.set({ coordinate: incoming.coordinate, heading: incoming.heading });
    active.set(canInterpolateVehicle(pose.get()?.coordinate ?? null, incoming, next.reducedMotion, config));
    origin.set(pose.get());
    started.set(null);
    lastUpdate.set(null);
    if (!active.get()) pose.set(target.get());
  });

  useFrameCallback(({ timestamp }) => {
    const from = origin.get();
    const to = target.get();
    if (!active.get() || !from || !to || !config) return;
    const startTime = started.get() ?? timestamp;
    if (started.get() === null) started.set(startTime);
    const lastTime = lastUpdate.get();
    if (lastTime !== null && timestamp - lastTime < 1000 / vehicleUpdatesPerSecond) return;
    lastUpdate.set(timestamp);
    const progress = Math.min(1, (timestamp - startTime) / config.durationMs);
    const eased = config.easing(progress);
    if (!Number.isFinite(eased) || progress === 1) {
      pose.set(to);
      active.set(false);
      return;
    }
    pose.set(interpolateVehiclePose(from, to, Math.min(1, Math.max(0, eased))));
  });
  return pose;
}
