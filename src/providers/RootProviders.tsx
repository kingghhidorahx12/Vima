import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { loadAsync, useFonts } from 'expo-font';
import { appFonts } from '../design/fonts';
import { VimaThemeProvider, VimaThemeControlContext } from '../design/themes';
import { createThemeControl } from '../design/themes/control';
import { resolveVimaTheme } from '../design/themes/resolve';
import { ReducedMotionProvider } from '../motion/ReducedMotion';
import { createQueryClient } from '../services/api/queryClient';
import { localStorage } from '../services/storage/local';
import { withDeadline } from '../services/api/deadline';

export function RootProviders({ children }: PropsWithChildren) {
  const [control] = useState(() => createThemeControl(localStorage, process.env.EXPO_PUBLIC_VIMA_THEME));
  const preference = useSyncExternalStore(control.subscribe, control.getSnapshot, control.getSnapshot);
  const theme = resolveVimaTheme(__DEV__, preference.name);
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [retryFontsLoaded, setRetryFontsLoaded] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryController = useRef<AbortController | null>(null);
  const [client] = useState(createQueryClient);
  const ready = (fontsLoaded || retryFontsLoaded) && preference.ready;
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setStalled(true), 10_000);
    return () => clearTimeout(timer);
  }, [ready]);
  useEffect(() => () => retryController.current?.abort(), []);
  const retry = async () => {
    if (retryController.current) return;
    const controller = new AbortController(); retryController.current = controller;
    setRetrying(true); setStalled(false);
    try {
      await withDeadline(loadAsync(appFonts), 10_000, controller.signal);
      if (!controller.signal.aborted) setRetryFontsLoaded(true);
    } catch { if (!controller.signal.aborted) setStalled(true); }
    finally { if (!controller.signal.aborted) setRetrying(false); retryController.current = null; }
  };
  useEffect(() => {
    void control.load();
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => { subscription.remove(); };
  }, [control]);
  return (
    <GestureHandlerRootView style={[styles.fill, theme.surfaces.screen]}
      onLayout={() => { void SplashScreen.hideAsync().catch(() => {}); }}>
      <QueryClientProvider client={client}>
        <VimaThemeProvider theme={theme}>
          <VimaThemeControlContext.Provider value={{ name: preference.name, setTheme: control.setTheme, toggleTheme: control.toggleTheme }}>
            <StatusBar style={theme.name === 'dark' ? 'light' : 'dark'} />
            <ReducedMotionProvider preference={preference.reducedMotion}>{ready ? children :
              <View testID="app-startup-progress" style={styles.startup} accessibilityLiveRegion="polite">
                <ActivityIndicator color={theme.roles.positiveStrong} />
                {/* Bootstrap cannot depend on the fonts whose loading it reports. */}
                <Text style={[styles.message, { color: theme.roles.textPrimary }]}>Preparando Vima…</Text>
                {(stalled || fontError) && !retrying ? <>
                  <Text style={[styles.message, { color: theme.roles.textSecondary }]}>No se pudo completar el inicio. Puedes reintentar sin borrar tu cuenta.</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Reintentar inicio" onPress={() => { void retry(); }}
                    style={[styles.retry, { backgroundColor: theme.roles.positiveStrong }]}>
                    <Text style={[styles.message, { color: theme.roles.onAction }]}>Reintentar inicio</Text>
                  </Pressable>
                </> : null}
              </View>}
            </ReducedMotionProvider>
          </VimaThemeControlContext.Provider>
        </VimaThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 },
  startup: { flex: 1, padding: 32, gap: 16, alignItems: 'center', justifyContent: 'center' },
  message: { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  retry: { minHeight: 48, borderRadius: 16, padding: 12, justifyContent: 'center' },
});
