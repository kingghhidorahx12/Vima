import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { TextInput, View, StyleSheet } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { registerDevMenuItems } from 'expo-dev-client';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createApiClient, type ApiClient } from '../services/api/client';
import { credentials } from '../services/storage/credentials';
import { createMatchingClient, type MatchingClient } from '../services/matching/client';
import type { MatchingIdentity } from '../services/matching/contracts';
import { VimaText } from '../design/primitives';
import { VimaButton } from '../design/components/VimaButton';

interface Session { api: ApiClient; matching: MatchingClient; identity: MatchingIdentity }
/** Technical DEV gate only. Tokens go directly to SecureStore, never to Query or public configuration. */
export function LiveAccountGate({ role, children }: { role: MatchingIdentity['role']; children: (session: Session) => ReactNode }) {
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
    void registerDevMenuItems([{ name: 'Cuenta de prueba Vima', callback: () => { setEditing(true); }, shouldCollapse: true }]).catch(() => {});
  }, []));
  if (!__DEV__) return null;
  if (session && !editing) return children(session);
  return <SafeAreaView style={styles.screen}><VimaText variant="h2">Cuenta DEV · {role === 'driver' ? 'Driver' : 'Passenger'}</VimaText>
    {session ? <VimaText variant="body">{session.identity.accountId}</VimaText> : null}
    <VimaText variant="body">Token de la configuración externa del gateway. Requiere HTTPS confiable.</VimaText>
    <TextInput secureTextEntry autoCapitalize="none" autoCorrect={false} value={token} onChangeText={setToken}
      placeholder="Token de prueba" accessibilityLabel="Token de prueba" style={styles.input} />
    <VimaButton label="Guardar y conectar" disabled={busy || !token.trim()} onPress={() => {
      const value = token.trim(); setToken(''); void credentials.write(value).then(() => { client.clear(); setSession(undefined); return connect(); })
        .catch(() => setError('No se pudo guardar la credencial.'));
    }} />
    <VimaButton secondary label="Limpiar cuenta" disabled={busy} onPress={() => { void credentials.clear().then(() => {
      setSession(undefined); client.clear(); setToken(''); setError('');
    }); }} />
    {session ? <VimaButton secondary label="Volver" onPress={() => setEditing(false)} /> : null}
    {error ? <VimaText variant="body" accessibilityRole="alert">{error}</VimaText> : null}
    <View style={styles.links}><Link href="/dev/passenger">Modo Passenger</Link><Link href="/dev/driver">Modo Driver</Link></View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 20, gap: 16, backgroundColor: 'white' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#2A2E2D', borderRadius: 16, paddingHorizontal: 16 }, links: { gap: 16 } });
