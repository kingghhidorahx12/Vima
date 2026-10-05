import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MapRef } from '@maplibre/maplibre-react-native';
import type { Coordinate } from './models';
import { locationOutsideViewport } from './locationVisibility';

/** Observe settled native projection, without issuing any camera command or polling. */
export function useLocationVisibility(map: RefObject<MapRef | null>, coordinate: Coordinate | undefined,
  width: number, visibleHeight: number, enabled: boolean, topOcclusion = 0) {
  const [outside, setOutside] = useState(false);
  const serial = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const moving = useRef(false);
  const invalidate = useCallback(() => { serial.current++; clearTimeout(timer.current); }, []);
  const sample = useCallback(() => {
    invalidate();
    if (!enabled || !coordinate || !Number.isFinite(width) || !Number.isFinite(visibleHeight) || width <= 0 || visibleHeight <= 0 || moving.current) return;
    const version = serial.current;
    timer.current = setTimeout(() => {
      void map.current?.project([...coordinate]).then(point => {
        if (version === serial.current) setOutside(previous => locationOutsideViewport(point, { width, height: visibleHeight, top: topOcclusion }, previous));
      }).catch(() => { /* A failed projection is not evidence that the user is offscreen. */ });
    }, 150);
  }, [coordinate, enabled, invalidate, map, visibleHeight, width, topOcclusion]);
  const start = useCallback(() => { moving.current = true; invalidate(); }, [invalidate]);
  const settled = useCallback(() => { moving.current = false; sample(); }, [sample]);
  useEffect(() => { sample(); return invalidate; }, [sample, invalidate]);
  return { outside: enabled && !!coordinate && outside, start, settled };
}
