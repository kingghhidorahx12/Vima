import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { appFonts } from '../design/fonts';
import { VimaThemeProvider } from '../design/themes';
import { lightTheme } from '../design/themes/light';
import { ReducedMotionProvider } from '../motion/ReducedMotion';
import { createQueryClient } from '../services/api/queryClient';
import { localStorage } from '../services/storage/local';

export function RootProviders({ children }: PropsWithChildren) {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [client] = useState(createQueryClient);
  const [preference, setPreference] = useState<'system' | 'reduce'>('reduce');
  useEffect(() => {
    let mounted = true;
    void localStorage.readPreferences().then((stored) => {
      if (mounted) setPreference(stored?.reducedMotion ?? 'system');
    }).catch(() => { /* Keep conservative reduced motion if storage is unavailable. */ });
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => { mounted = false; subscription.remove(); };
  }, []);
  if (fontError) throw fontError;
  if (!fontsLoaded) return null;
  return (
    <GestureHandlerRootView style={[styles.fill, lightTheme.surfaces.screen]}>
      <QueryClientProvider client={client}>
        <VimaThemeProvider theme={lightTheme}>
          <ReducedMotionProvider preference={preference}>{children}</ReducedMotionProvider>
        </VimaThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
