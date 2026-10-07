import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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

let sequence = 0;
const operationId = () => `driver-${Date.now()}-${++sequence}`;
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
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [now, setNow] = useState(() => Date.now());
  const pending = useRef<{ id: string; run: (id: string) => Promise<DriverState> } | undefined>(undefined);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => { const listener = AppState.addEventListener('change', value => setForeground(value === 'active')); return () => listener.remove(); }, []);
  useEffect(() => {
    if (!available || !focused || !foreground) return;
    void queryClient.invalidateQueries({ queryKey: ['driver', accountId] });
    return client.subscribeDriver(() => { void queryClient.invalidateQueries({ queryKey: ['driver', accountId] }); });
  }, [client, accountId, queryClient, available, focused, foreground]);
  const availability = state.data?.availability;
  useEffect(() => {
    if (availability !== 'AVAILABLE' || !focused || !foreground) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const update = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) { setError('Se necesita ubicación para recibir ofertas.'); return; }
        const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (controller.signal.aborted) return;
        const heading = coords.heading !== null && Number.isFinite(coords.heading) && coords.heading >= 0 && coords.heading < 360 ? coords.heading : undefined;
        const snapshot = await client.location([coords.longitude, coords.latitude], heading, operationId(), controller.signal);
        if (!controller.signal.aborted) queryClient.setQueryData<DriverState>(['driver', accountId], old => old && old.revision >= snapshot.revision ? old : snapshot);
      } catch { if (!controller.signal.aborted) setError('No se pudo actualizar la ubicación.'); }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { void update(); }, 15_000); }
    };
    void update(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [client, accountId, queryClient, availability, focused, foreground]);
  const expiresAt = state.data?.offer?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [expiresAt]);
  const act = async (run?: (id: string) => Promise<DriverState>) => {
    if (busy) return;
    if (!pending.current && run) pending.current = { id: operationId(), run };
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
  const labels = { OFFLINE: 'Desconectado', AVAILABLE: 'Disponible', PAUSED: 'En pausa', ASSIGNED: 'Asignado' };
  return <SafeAreaView style={styles.fill}><DriverRideShell mapContent={location ? <>
    <Camera target={{ center: location.coordinate, zoom: 14 }} />
    <PassengerUserLocation active={foreground && focused} place={{ id: 'driver-current', name: '', address: '', coordinate: location.coordinate }} />
  </> : undefined} renderPhase={() => <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
    <VimaText variant="h2">Driver P0 · {data?.profile.driver.name ?? accountId}</VimaText>
    <VimaText variant="bodyRegular">{accountId} · {connection === 'online' ? 'Conectado' : connection === 'reconnecting' ? 'Reconectando' : 'Sin conexión'}</VimaText>
    <VimaText variant="bodyRegular">{data ? labels[data.availability] : available ? 'Cargando estado…' : 'Matching no configurado'}</VimaText>
    {data && !assigned ? <View style={styles.actions}>
      <VimaButton label={availability === 'PAUSED' ? 'Reanudar disponibilidad' : 'Disponible'} disabled={busy || !!pending.current || availability === 'AVAILABLE'}
        onPress={() => { void act(id => client.availability('AVAILABLE', id)); }} />
      <VimaButton secondary label="Desconectarme" disabled={busy || !!pending.current || availability === 'OFFLINE'}
        onPress={() => { void act(id => client.availability('OFFLINE', id)); }} />
    </View> : null}
    {offer ? <View style={styles.content}><VimaText variant="h3">Oferta · {Math.max(0, Math.ceil((offer.expiresAt - now) / 1000))} s</VimaText>
      <VimaText variant="bodyRegular">{offer.pickup.name} · {offer.pickup.address}</VimaText><VimaText variant="bodyRegular">Recogida a {offer.etaMinutes} min</VimaText>
      <VimaButton label="Aceptar" disabled={busy || !!pending.current || now >= offer.expiresAt} onPress={() => { void act(id => client.offerAction(offer.id, 'accept', id)); }} />
      <VimaButton secondary label="Rechazar" disabled={busy || !!pending.current} onPress={() => { void act(id => client.offerAction(offer.id, 'reject', id)); }} />
    </View> : null}
    {assigned ? <View style={styles.content}><VimaText variant="h3">Asignación confirmada</VimaText>
      <VimaText variant="bodyRegular">{assigned.value.id}</VimaText><VimaText variant="bodyRegular">{assigned.pickup.name} · {assigned.pickup.address}</VimaText>
      <VimaButton secondary danger label="Cancelar asignación" disabled={busy || !!pending.current}
        onPress={() => { void act(id => client.cancelAssignment(assigned.requestId, id)); }} />
    </View> : null}
    {error || state.error ? <VimaText variant="bodyRegular" accessibilityRole="alert">{error || 'No se pudo leer el estado.'}</VimaText> : null}
    {pending.current ? <VimaButton secondary label="Reintentar acción" disabled={busy} onPress={() => { void act(); }} /> : null}
  </ScrollView>} /></SafeAreaView>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, panel: { maxHeight: '70%' }, content: { padding: 16, gap: 12 },
  actions: { gap: 8 }, surface: { backgroundColor: t.colors.white } });
