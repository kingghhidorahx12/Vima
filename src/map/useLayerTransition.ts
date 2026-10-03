import { useEffect, useState } from 'react';
import { useMotionPolicy } from '../motion/ReducedMotion';
import { mapPersonality } from '../motion/mapPersonality';

/** Native paint transitions; only mount/toggle boundaries reach React. */
export function useLayerTransition(enabled: boolean, incident = false) {
  const { reducedMotion } = useMotionPolicy();
  const [mounted, setMounted] = useState(enabled);
  const [visible, setVisible] = useState(false);
  const duration = reducedMotion ? 0 : incident && enabled ? mapPersonality.incident.duration : mapPersonality.layer.duration;
  useEffect(() => {
    const timer = setTimeout(() => { if (enabled) setMounted(true); setVisible(enabled); }, 0);
    const removal = !enabled ? setTimeout(() => setMounted(false), duration) : undefined;
    return () => { clearTimeout(timer); clearTimeout(removal); };
  }, [duration, enabled]);
  return { mounted: enabled || mounted, visible, duration };
}
