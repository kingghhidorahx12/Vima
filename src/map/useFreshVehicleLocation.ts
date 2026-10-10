import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { BearingFix } from './vehicleBearing';
import { matchingLocationPolicy } from '../services/matching/policy';

/** A timer is a freshness deadline, not an animation clock. No old sample is labelled live. */
export function useFreshVehicleLocation(location: BearingFix | undefined) {
  const [fresh, setFresh] = useState<BearingFix>();
  const captured = location?.receivedAt;
  const lng = location?.coordinate[0]; const lat = location?.coordinate[1]; const heading = location?.heading;
  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      setFresh(captured !== undefined && Number.isSafeInteger(captured) && captured >= 0 && captured <= now + 5000 &&
        now - captured < matchingLocationPolicy.ttlMs && lng !== undefined && lat !== undefined
        ? { coordinate: [lng, lat], heading, receivedAt: captured } : undefined);
    };
    refresh();
    const timer = captured === undefined ? undefined : setTimeout(refresh,
      Math.max(0, captured + matchingLocationPolicy.ttlMs - Date.now()));
    const subscription = AppState.addEventListener('change', refresh);
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [captured, lng, lat, heading]);
  return fresh;
}
