import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { LiveAccountGate } from '../LiveAccountGate';
import type { MatchingClient } from '../../services/matching/client';
import type { DriverState } from '../../services/matching/contracts';
import { ApiError } from '../../services/api/client';
import { DriverRideShell } from '../../features/driver/DriverRideShell';
import { VimaText } from '../../design/primitives';
import { VimaButton } from '../../design/components/VimaButton';
import { visualTokens as t } from '../../design/tokens';
import { Camera } from '../../map/Camera';
import { PassengerUserLocation } from '../../features/passenger/PassengerMapPin';
import { createDriverLocationSession, type DriverLocationStopReason } from './locationSession';
import { driverOperationId, type DriverOperationKind } from '../../services/matching/operationId';
import { DriverOffer } from './DriverOffer';

export default function DriverLiveScreen() {
  return <LiveAccountGate role="driver">{session => <DriverSurface key={session.identity.accountId} client={session.matching}
    accountId={session.identity.accountId} available={session.identity.matchingAvailable} />}</LiveAccountGate>;
}
function DriverSurface({ client, accountId, available }: { client: MatchingClient; accountId: string; available: boolean }) {
  const queryClient = useQueryClient(); const key = ['driver', accountId];
  const state = useQuery({ queryKey: key, queryFn: ({ signal }) => client.driver(signal), enabled: available, retry: false,
    structuralSharing: (old, next) => old && (old as DriverState).revision >= (next as DriverState).revision ? old : next });
  const connection = useSyncExternalStore(client.subscribeConnection, client.getConnection, client.getConnection);
  const [focused, setFocused] = useState(false); const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [permissionPromptActive, setPermissionPromptActive] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [now, setNow] = useState(() => Date.now());
  const pending = useRef<{ id: string; run: (id: string) => Promise<DriverState> } | undefined>(undefined);
  const locationSession = useRef<ReturnType<typeof createDriverLocationSession> | undefined>(undefined);
  const actualForeground = useRef(AppState.currentState === 'active');
  const permissionPrompt = useRef(false);
  const lifecycle = useRef({ accountId, client, available, focused, foreground, permissionPromptActive, tracksLocation: false });
  const reportPermissionPrompt = useCallback((active: boolean) => {
    permissionPrompt.current = active; setPermissionPromptActive(active);
  }, []);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => { const listener = AppState.addEventListener('change', value => {
    const active = value === 'active'; actualForeground.current = active; locationSession.current?.setForeground(active);
    if (active || !permissionPrompt.current) setForeground(active);
  }); return () => listener.remove(); }, []);
  const realtimeAllowed = available && focused && (foreground || permissionPromptActive);
  useEffect(() => {
    if (!realtimeAllowed) return;
    void queryClient.invalidateQueries({ queryKey: ['driver', accountId] });
    const stop = client.subscribeDriver(() => { void queryClient.invalidateQueries({ queryKey: ['driver', accountId] }); });
    return () => {
      const current = lifecycle.current;
      const reason = !current.focused ? 'unsubscribe_unfocus'
        : !current.available ? 'unsubscribe_availability'
          : !current.foreground && !current.permissionPromptActive ? 'unsubscribe_background'
            : current.accountId !== accountId || current.client !== client ? 'unsubscribe_account' : 'abort';
      stop(reason);
    };
  }, [client, accountId, queryClient, realtimeAllowed]);
  const availability = state.data?.availability;
  const tracksLocation = availability === 'LOCATING' || availability === 'AVAILABLE';
  useLayoutEffect(() => {
    lifecycle.current = { accountId, client, available, focused, foreground, permissionPromptActive, tracksLocation };
  }, [accountId, client, available, focused, foreground, permissionPromptActive, tracksLocation]);
  useEffect(() => {
    if (!tracksLocation || !focused) return;
    const session = createDriverLocationSession({
      foreground: actualForeground.current, onPermissionPromptChange: reportPermissionPrompt,
      location: { getForegroundPermissionsAsync: Location.getForegroundPermissionsAsync,
        requestForegroundPermissionsAsync: Location.requestForegroundPermissionsAsync,
        getProviderStatusAsync: Location.getProviderStatusAsync, getLastKnownPositionAsync: () => Location.getLastKnownPositionAsync(),
        watchPositionAsync: Location.watchPositionAsync,
        balancedAccuracy: Location.Accuracy.Balanced }, operationId: () => driverOperationId('location'),
      send: async (coordinate, heading, id, signal) => {
        const snapshot = await client.location(coordinate, heading, id, signal);
        if (!signal.aborted) { setError(''); queryClient.setQueryData<DriverState>(['driver', accountId], old => old && old.revision >= snapshot.revision ? old : snapshot); }
        return { availability: snapshot.availability, revision: snapshot.revision };
      }, onError: setError,
    });
    locationSession.current = session;
    return () => {
      if (locationSession.current === session) locationSession.current = undefined;
      const current = lifecycle.current;
      const reason: DriverLocationStopReason = current.accountId !== accountId || current.client !== client ? 'account_changed'
        : !current.focused ? 'unfocused' : !current.tracksLocation ? 'availability_changed' : 'unmount';
      session.stop(reason);
    };
  }, [client, accountId, queryClient, tracksLocation, focused, reportPermissionPrompt]);
  const expiresAt = state.data?.offer?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [expiresAt]);
  const act = async (kind?: DriverOperationKind, run?: (id: string) => Promise<DriverState>) => {
    if (busy) return;
    if (!pending.current && kind && run) pending.current = { id: driverOperationId(kind), run };
    if (!pending.current) return;
    setBusy(true); setError('');
    try {
      const snapshot = await pending.current.run(pending.current.id); pending.current = undefined;
      queryClient.setQueryData<DriverState>(key, old => old && old.revision >= snapshot.revision ? old : snapshot);
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        pending.current = undefined; setError('La acción ya no está disponible. Se actualizará el estado.');
      } else setError('Acción sin confirmar. Reintenta para reconciliar el mismo intento.');
    }
    finally { setBusy(false); void queryClient.invalidateQueries({ queryKey: key }); }
  };
  const data = state.data; const offer = data?.offer; const assigned = data?.assignment;
  const location = data?.location;
  const labels = { OFFLINE: 'Desconectado', LOCATING: 'Localizando…', AVAILABLE: 'Disponible', PAUSED: 'En pausa', ASSIGNED: 'Asignado' };
  return <SafeAreaView style={styles.fill}><DriverRideShell mapContent={location ? <>
    <Camera target={{ center: location.coordinate, zoom: 14 }} />
    <PassengerUserLocation active={foreground && focused} place={{ id: 'driver-current', name: '', address: '', coordinate: location.coordinate }} />
  </> : undefined} renderPhase={() => offer ? <View>
    <DriverOffer offer={offer} revision={data!.revision} now={now} disabled={busy || !!pending.current}
      onAccept={() => { void act('offer_accept', id => client.offerAction(offer.id, 'accept', id)); }}
      onReject={() => { void act('offer_reject', id => client.offerAction(offer.id, 'reject', id)); }} />
    {error ? <VimaText variant="bodyRegular" accessibilityRole="alert">{error}</VimaText> : null}
    {pending.current ? <VimaButton secondary label="Reintentar acción" disabled={busy} onPress={() => { void act(); }} /> : null}
  </View> : <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
    <VimaText variant="h2">Driver P0 · {data?.profile.driver.name ?? accountId}</VimaText>
    <VimaText variant="bodyRegular">{accountId} · {connection === 'online' ? 'Conectado' : connection === 'reconnecting' ? 'Reconectando' : 'Sin conexión'}</VimaText>
    <VimaText variant="bodyRegular">{data ? labels[data.availability] : available ? 'Cargando estado…' : 'Matching no configurado'}</VimaText>
    {data && !assigned ? <View style={styles.actions}>
      <VimaButton label={availability === 'PAUSED' ? 'Reanudar disponibilidad' : 'Disponible'} disabled={busy || !!pending.current || ['LOCATING', 'AVAILABLE'].includes(availability ?? '')}
        onPress={() => { void act('availability_available', id => client.availability('AVAILABLE', id)); }} />
      <VimaButton secondary label="Desconectarme" disabled={busy || !!pending.current || availability === 'OFFLINE'}
        onPress={() => { void act('availability_offline', id => client.availability('OFFLINE', id)); }} />
    </View> : null}
    {assigned ? <View style={styles.content}><VimaText variant="h3">Asignación confirmada</VimaText>
      <VimaText variant="bodyRegular">{assigned.value.id}</VimaText><VimaText variant="bodyRegular">{assigned.pickup.name} · {assigned.pickup.address}</VimaText>
      <VimaButton secondary danger label="Cancelar asignación" disabled={busy || !!pending.current}
        onPress={() => { void act('assignment_cancel', id => client.cancelAssignment(assigned.requestId, id)); }} />
    </View> : null}
    {error || state.error ? <VimaText variant="bodyRegular" accessibilityRole="alert">{error || 'No se pudo leer el estado.'}</VimaText> : null}
    {pending.current ? <VimaButton secondary label="Reintentar acción" disabled={busy} onPress={() => { void act(); }} /> : null}
  </ScrollView>} /></SafeAreaView>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, panel: { maxHeight: '70%' }, content: { padding: 16, gap: 12 },
  actions: { gap: 8 }, surface: { backgroundColor: t.colors.white } });
