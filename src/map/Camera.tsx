import { Camera as NativeCamera, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { motionTimings } from '../motion/timing';
import { fitBounds, type CameraTarget, type ApprovedCameraMotion, type MapPadding } from './models';
export type { CameraTarget, ApprovedCameraMotion } from './models';
export type CameraMode = 'automatic' | 'search-locked' | 'user-controlled';
export interface RecenterIntent { readonly coordinate: readonly [number, number]; readonly sequence: number }
export interface RouteFitIntent { readonly coordinates: readonly (readonly [number, number])[]; readonly sequence: number; readonly padding?: MapPadding }

export function Camera({ target, motion, mode = 'automatic', recenter, fitRoute }: {
  target?: CameraTarget; motion?: ApprovedCameraMotion; mode?: CameraMode; recenter?: RecenterIntent; fitRoute?: RouteFitIntent;
}) {
  const ref = useRef<CameraRef>(null);
  const { allowCameraAnimation } = useMotionPolicy();
  // Read the latest viewport at an explicit recenter without refitting on sheet changes during Search.
  const currentPadding = useRef(target?.padding);
  useEffect(() => { currentPadding.current = target?.padding; }, [target]);
  useEffect(() => {
    if (!target || mode !== 'automatic') return;
    const { padding, zoom, pitch, bearing } = target;
    const options = { padding, zoom, pitch, bearing };
    const stop = target.center
      ? { ...options, center: [...target.center] as [number, number] }
      : { ...options, bounds: fitBounds(target.bounds ? [target.bounds.southwest, target.bounds.northeast] : target.coordinates!) };
    void ref.current?.setStop({ ...stop, ...(allowCameraAnimation && motion ? motion : { duration: 0 }) });
  }, [target, motion, allowCameraAnimation, mode]);
  useEffect(() => {
    if (!recenter) return;
    void ref.current?.setStop({ center: [...recenter.coordinate] as [number, number],
      padding: currentPadding.current,
      duration: allowCameraAnimation ? motionTimings.map.duration : 0 });
  }, [recenter, allowCameraAnimation]);
  const fittedSequence = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!fitRoute || mode === 'search-locked' || fittedSequence.current === fitRoute.sequence) return;
    fittedSequence.current = fitRoute.sequence;
    void ref.current?.setStop({ bounds: fitBounds(fitRoute.coordinates), padding: fitRoute.padding ?? target?.padding,
      duration: allowCameraAnimation ? motionTimings.map.duration : 0 });
  }, [fitRoute, target, mode, allowCameraAnimation]);
  return <NativeCamera ref={ref} />;
}
