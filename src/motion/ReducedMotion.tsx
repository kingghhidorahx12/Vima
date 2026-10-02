import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { createMotionPolicy } from './policy';

// Conservative until the OS preference has been read.
const MotionContext = createContext(createMotionPolicy(true));

export function ReducedMotionProvider({ children, preference = 'system' }: PropsWithChildren<{
  preference?: 'system' | 'reduce';
}>) {
  const [systemReduced, setSystemReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const requestedRevision = ++revision;
      void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
        if (active && requestedRevision === revision) setSystemReduced(value);
      }).catch(() => { if (active) setSystemReduced(true); });
    };
    const change = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      revision += 1;
      setSystemReduced(value);
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    refresh();
    return () => { active = false; change.remove(); appState.remove(); };
  }, []);
  const policy = useMemo(() => createMotionPolicy(systemReduced || preference === 'reduce'), [systemReduced, preference]);
  return <MotionContext.Provider value={policy}>{children}</MotionContext.Provider>;
}

export const useMotionPolicy = () => useContext(MotionContext);
