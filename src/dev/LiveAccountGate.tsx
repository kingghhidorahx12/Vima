import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { TextInput, View, StyleSheet } from 'react-native';
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


interface Session { api: ApiClient; matching: MatchingClient; identity: MatchingIdentity }
/** Technical DEV gate only. Tokens go directly to SecureStore, never to Query or public configuration. */
export function LiveAccountGate({ role, children }: { role: MatchingIdentity['role']; children: (session: Session) => ReactNode }) {
  const theme = useVimaTheme();
  const client = useQueryClient(); const [session, setSession] = useState<Session>(); const [editing, setEditing] = useState(false);
  const [token, setToken] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const connect = useCallback(async () => {
    try {
      if (!await credentials.read()) return;
      setBusy(true); setError('');
      const api = createApiClient(process.env.EXPO_PUBLIC_VIMA_API_BASE_URL!, credentials.read, { development: __DEV__ });
      const matching = createMatchingClient(api); const identity = await matching.identity();
      if (identity.role !== role) { setError(`Esta cuenta es ${identity.role === 'driver' ? 'Driver' : 'Passenger'}. Abre su modo correspondiente.`); return; }
      setSession({ api, matching, identity }); setEditing(false);
    } catch { setError('No se pudo validar la cuenta. Revisa el token y la URL HTTPS confiable del gateway.'); }
    finally { setBusy(false); }
  }, [role]);
  useEffect(() => {
    let active = true;
    void credentials.read().then(value => { if (active && value) void connect(); })
      .catch(() => { if (active) setError('No se pudo leer la credencial guardada.'); });
    return () => { active = false; };
  }, [connect]);
  useFocusEffect(useCallback(() => {
    if (!__DEV__) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- DevMenu is stripped from QA/release.
    const { registerDevMenuItems } = require('expo-dev-client') as typeof import('expo-dev-client');
    void registerDevMenuItems([{ name: 'Cuenta de prueba Vima', callback: () => { setEditing(true); }, shouldCollapse: true }]).catch(() => {});
  }, []));
  if (!__DEV__ && process.env.EXPO_PUBLIC_VIMA_VARIANT !== 'qa') return null;
  if (session && !editing) return <View style={{ flex: 1 }}>{children(session)}
    {process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? <View style={{ position: 'absolute', top: 60, left: 16 }}><VimaButton secondary label="Cuenta QA / cambiar modo" onPress={() => setEditing(true)} /></View> : null}</View>;
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.roles.background }]}><VimaText variant="h2">{process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? 'Cuenta QA ·' : 'Cuenta DEV ·'} {role === 'driver' ? 'Driver' : 'Passenger'}</VimaText>
    {session ? <VimaText variant="bodyRegular">{session.identity.accountId}</VimaText> : null}
    <VimaText variant="bodyRegular">Token de la configuración externa del gateway. Requiere HTTPS confiable.</VimaText>
    <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} value={token} onChangeText={setToken}
      placeholder="Token de prueba" placeholderTextColor={theme.roles.disabledText} accessibilityLabel="Token de prueba"
      style={[styles.input, { backgroundColor: theme.roles.elevatedSurface, borderColor: theme.roles.border, color: theme.roles.textPrimary }]} />
    <VimaButton label="Guardar y conectar" disabled={busy || !token.trim()} onPress={() => {
      const value = token.trim(); setToken(''); void credentials.write(value).then(() => { client.clear(); setSession(undefined); return connect(); })
        .catch(() => setError('No se pudo guardar la credencial.'));
    }} />
    <VimaButton secondary label="Limpiar cuenta" disabled={busy} onPress={() => { void credentials.clear().then(() => {
      setSession(undefined); client.clear(); setToken(''); setError('');
    }); }} />
    {session ? <VimaButton secondary label="Volver" onPress={() => setEditing(false)} /> : null}
    {error ? <VimaText variant="bodyRegular" accessibilityRole="alert">{error}</VimaText> : null}
    <View style={styles.links}><Link href={process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? '../qa/passenger' : '/dev/passenger'}>Modo Passenger</Link><Link href={process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? '../qa/driver' : '/dev/driver'}>Modo Driver</Link></View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 20, gap: 16 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 }, links: { gap: 16 } });
