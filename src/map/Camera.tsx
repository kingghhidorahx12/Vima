import { Camera as NativeCamera, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { fitBounds, type CameraTarget, type ApprovedCameraMotion } from './models';
export type { CameraTarget, ApprovedCameraMotion } from './models';

export function Camera({ target, motion }: { target?: CameraTarget; motion?: ApprovedCameraMotion }) {
  const ref = useRef<CameraRef>(null);
  const { allowCameraAnimation } = useMotionPolicy();
  useEffect(() => {
    if (!target) return;
    const { padding, zoom, pitch, bearing } = target;
    const options = { padding, zoom, pitch, bearing };
    const stop = target.center
      ? { ...options, center: [...target.center] as [number, number] }
      : { ...options, bounds: fitBounds(target.bounds ? [target.bounds.southwest, target.bounds.northeast] : target.coordinates!) };
    void ref.current?.setStop({ ...stop, ...(allowCameraAnimation && motion ? motion : { duration: 0 }) });
  }, [target, motion, allowCameraAnimation]);
  return <NativeCamera ref={ref} />;
}
