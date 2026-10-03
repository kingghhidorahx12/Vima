import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useMotionActive(visible = true) {
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  return visible && foreground;
}
