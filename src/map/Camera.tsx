import { Camera as NativeCamera, type CameraRef, type CameraCenterOptions, type CameraOptions, type CameraEasing } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { useMotionPolicy } from '../motion/ReducedMotion';

export type CameraTarget = CameraCenterOptions & CameraOptions;
export interface ApprovedCameraMotion {
  readonly duration: number;
  readonly easing: Exclude<CameraEasing, undefined>;
}

export function Camera({ target, motion }: { target?: CameraTarget; motion?: ApprovedCameraMotion }) {
  const ref = useRef<CameraRef>(null);
  const { allowCameraAnimation } = useMotionPolicy();
  useEffect(() => {
    if (!target) return;
    if (!allowCameraAnimation || !motion) {
      ref.current?.jumpTo(target);
    } else {
      void ref.current?.setStop({ ...target, ...motion });
    }
  }, [target, motion, allowCameraAnimation]);
  return <NativeCamera ref={ref} />;
}
