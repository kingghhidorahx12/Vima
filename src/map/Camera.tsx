import { useEffect } from 'react';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { Camera as LegacyCamera } from './legacy/Camera';
import { useMapContext } from './MapContext';
import { googleCameraCommand } from './google/camera';
import type { CameraTarget, ApprovedCameraMotion } from './models';
export type { CameraTarget, ApprovedCameraMotion } from './models';

export function Camera({ target, motion }: { target?: CameraTarget; motion?: ApprovedCameraMotion }) {
  const { provider, map, ready, padding, setPadding } = useMapContext();
  const { reducedMotion } = useMotionPolicy();
  useEffect(() => {
    if (provider !== 'google' || !ready || !target) return;
    const next = target.padding ?? {};
    if (JSON.stringify(padding) !== JSON.stringify(next)) { setPadding(next); return; }
    const frame = requestAnimationFrame(() => {
      const command = googleCameraCommand(target, reducedMotion, motion);
      if (command.kind === 'fit') map.current?.fitToCoordinates(command.coordinates, command.options);
      else if (command.animated) map.current?.animateCamera(command.camera, { duration: command.duration });
      else map.current?.setCamera(command.camera);
    });
    return () => cancelAnimationFrame(frame);
  }, [provider, ready, target, motion, reducedMotion, map, padding, setPadding]);
  return provider === 'maplibre' ? <LegacyCamera target={target} motion={motion} /> : null;
}
