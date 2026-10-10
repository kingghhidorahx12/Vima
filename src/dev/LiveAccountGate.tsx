import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, TextInput, View, StyleSheet } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';

import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createApiClient, type ApiClient } from '../services/api/client';
import { credentials } from '../services/storage/credentials';
import { createMatchingClient, type MatchingClient } from '../services/matching/client';
import type { MatchingIdentity } from '../services/matching/contracts';
import { VimaText } from '../design/primitives';
import { VimaButton } from '../design/components/VimaButton';
import { useVimaTheme } from '../design/themes';
import { withDeadline } from '../services/api/deadline';
import { accountValidationMessage } from './accountValidation';


interface Session { api: ApiClient; matching: MatchingClient; identity: MatchingIdentity }
/** Technical DEV gate only. Tokens go directly to SecureStore, never to Query or public configuration. */
export function LiveAccountGate({ role, children }: { role: MatchingIdentity['role']; children: (session: Session) => ReactNode }) {
  const theme = useVimaTheme();
  const client = useQueryClient(); const [session, setSession] = useState<Session>(); const [editing, setEditing] = useState(false);
  const [token, setToken] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const attempt = useRef<AbortController | null>(null);
  const validatedAccount = useRef<{ credential: string; session: Session } | null>(null);
  const connect = useCallback(async (replacement?: string) => {
    if (attempt.current) return;
    const controller = new AbortController(); attempt.current = controller;
    const isCurrent = () => attempt.current === controller && !controller.signal.aborted;
    setBusy(true); setError('');
    try {
      const validated = await withDeadline((async () => {
        const saved = replacement ?? await credentials.read();
        if (!isCurrent()) return;
        if (!saved) { validatedAccount.current = null; setSession(undefined); return; }
        const previous = validatedAccount.current;
        if (!replacement && previous?.credential === saved && previous.session.identity.role === role)
          return { ...previous, activate: () => {} };
        if (!replacement && previous && previous.credential !== saved) {
          validatedAccount.current = null; setSession(undefined);
        }
        // Validate the candidate before writing it. After commit, preserve the existing
        // SecureStore reader used by live clients/journals during credential replacement.
        let live = false;
        const api = createApiClient(process.env.EXPO_PUBLIC_VIMA_API_BASE_URL!,
          () => live ? credentials.read() : Promise.resolve(saved), { development: __DEV__ });
        const matching = createMatchingClient(api);
        const identity = await matching.identity(controller.signal);
        return { credential: saved, session: { api, matching, identity }, activate: () => { live = true; } };
      })(), 12_000, controller.signal, () => controller.abort());
      if (!validated || attempt.current !== controller) return;
      if (validated.session.identity.role !== role) { setError(`Esta cuenta es ${validated.session.identity.role === 'driver' ? 'Driver' : 'Passenger'}. Abre su modo correspondiente.`); return; }
      // A failed validation never replaces or clears the saved credential.
      if (replacement) await withDeadline(credentials.write(replacement), 8000, controller.signal);
      if (!isCurrent()) return;
      if (replacement) client.clear();
      validated.activate(); validatedAccount.current = { credential: validated.credential, session: validated.session };
      setSession(validated.session); setEditing(false); setToken('');
    } catch (error) { if (attempt.current === controller) setError(accountValidationMessage(error)); }
    finally { if (attempt.current === controller) { attempt.current = null; setBusy(false); } }
  }, [client, role]);
  useFocusEffect(useCallback(() => {
    if (__DEV__ || process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa') {
      void connect();
    }
    return () => { const active = attempt.current; attempt.current = null; active?.abort(); };
  }, [connect]));
  useFocusEffect(useCallback(() => {
    if (!__DEV__) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- DevMenu is stripped from QA/release.
    const { registerDevMenuItems } = require('expo-dev-client') as typeof import('expo-dev-client');
    void registerDevMenuItems([{ name: 'Cuenta de prueba Vima', callback: () => { setEditing(true); }, shouldCollapse: true }]).catch(() => {});
  }, []));
  if (!__DEV__ && process.env.EXPO_PUBLIC_VIMA_VARIANT !== 'qa') return null;
  if (session && session.identity.role === role && !editing) return <View style={{ flex: 1 }}>{children(session)}
    {process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? <View style={{ position: 'absolute', top: 60, left: 16 }}><VimaButton secondary label="Cuenta QA / cambiar modo" onPress={() => setEditing(true)} /></View> : null}</View>;
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.roles.background }]}><VimaText variant="h2">{process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? 'Cuenta QA ·' : 'Cuenta DEV ·'} {role === 'driver' ? 'Driver' : 'Passenger'}</VimaText>
    {session ? <VimaText variant="bodyRegular">{session.identity.accountId}</VimaText> : null}
    <VimaText variant="bodyRegular">Token de la configuración externa del gateway. Requiere HTTPS confiable.</VimaText>
    <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} value={token} onChangeText={setToken}
      placeholder="Token de prueba" placeholderTextColor={theme.roles.disabledText} accessibilityLabel="Token de prueba"
      style={[styles.input, { backgroundColor: theme.roles.elevatedSurface, borderColor: theme.roles.border, color: theme.roles.textPrimary }]} />
    {busy ? <View accessibilityLiveRegion="polite" style={styles.progress}><ActivityIndicator color={theme.roles.positiveStrong} />
      <VimaText variant="bodyRegular">Validando cuenta…</VimaText></View> : null}
    <VimaButton label="Guardar y conectar" disabled={busy || !token.trim()} onPress={() => { void connect(token.trim()); }} />
    {error ? <VimaButton secondary label="Reintentar cuenta guardada" disabled={busy} onPress={() => { void connect(); }} /> : null}
    <VimaButton secondary label="Limpiar cuenta" disabled={busy} onPress={() => { void credentials.clear().then(() => {
      validatedAccount.current = null; setSession(undefined); client.clear(); setToken(''); setError('');
    }); }} />
    {session ? <VimaButton secondary label="Volver" onPress={() => setEditing(false)} /> : null}
    {error ? <VimaText variant="bodyRegular" accessibilityRole="alert">{error}</VimaText> : null}
    <View style={styles.links}><Link href={process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? '../qa/passenger' : '/dev/passenger'}>Modo Passenger</Link><Link href={process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? '../qa/driver' : '/dev/driver'}>Modo Driver</Link></View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 20, gap: 16 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 }, links: { gap: 16 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 12 } });
