import { Camera as NativeCamera, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import type { CameraTarget, ApprovedCameraMotion } from '../models';

export function Camera({ target, motion }: { target?: CameraTarget; motion?: ApprovedCameraMotion }) {
  const ref = useRef<CameraRef>(null);
  const { allowCameraAnimation } = useMotionPolicy();
  useEffect(() => {
    if (!target) return;
    const { padding, zoom, pitch, bearing } = target;
    const options = { padding, zoom, pitch, bearing };
    if (target.center) {
      const stop = { ...options, center: [...target.center] as [number, number] };
      if (!allowCameraAnimation || !motion) ref.current?.jumpTo(stop);
      else void ref.current?.setStop({ ...stop, ...motion });
    } else {
      const points = target.coordinates ?? [target.bounds!.southwest, target.bounds!.northeast];
      const bounds: [number, number, number, number] = target.bounds
        ? [...target.bounds.southwest, ...target.bounds.northeast]
        : [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
          Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
      void ref.current?.setStop({ ...options, bounds, duration: allowCameraAnimation && motion ? motion.duration : 0 });
    }
  }, [target, motion, allowCameraAnimation]);
  return <NativeCamera ref={ref} />;
}
