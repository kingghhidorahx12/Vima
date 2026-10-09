import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { appFonts } from '../design/fonts';
import { VimaThemeProvider, VimaThemeControlContext } from '../design/themes';
import { createThemeControl } from '../design/themes/control';
import { resolveVimaTheme } from '../design/themes/resolve';
import { ReducedMotionProvider } from '../motion/ReducedMotion';
import { createQueryClient } from '../services/api/queryClient';
import { localStorage } from '../services/storage/local';

export function RootProviders({ children }: PropsWithChildren) {
  const [control] = useState(() => createThemeControl(localStorage, process.env.EXPO_PUBLIC_VIMA_THEME));
  const preference = useSyncExternalStore(control.subscribe, control.getSnapshot, control.getSnapshot);
  const theme = resolveVimaTheme(__DEV__, preference.name);
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [client] = useState(createQueryClient);
  useEffect(() => {
    void control.load();
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => { subscription.remove(); };
  }, [control]);
  if (fontError) throw fontError;
  if (!fontsLoaded || !preference.ready) return null;
  return (
    <GestureHandlerRootView style={[styles.fill, theme.surfaces.screen]}>
      <QueryClientProvider client={client}>
        <VimaThemeProvider theme={theme}>
          <VimaThemeControlContext.Provider value={{ name: preference.name, setTheme: control.setTheme, toggleTheme: control.toggleTheme }}>
            <StatusBar style={theme.name === 'dark' ? 'light' : 'dark'} />
            <ReducedMotionProvider preference={preference.reducedMotion}>{children}</ReducedMotionProvider>
          </VimaThemeControlContext.Provider>
        </VimaThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
