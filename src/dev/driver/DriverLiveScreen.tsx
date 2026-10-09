import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useDriverLifecycle } from './useDriverLifecycle';
import { DriverLifecycleControls } from '../../features/driver/DriverLifecycleControls';
import { LiveAccountGate } from '../LiveAccountGate';
import type { MatchingClient } from '../../services/matching/client';
import type { DriverState } from '../../services/matching/contracts';
import { createDriverActions } from '../../services/matching/driverActions';
import { DriverRideShell } from '../../features/driver/DriverRideShell';
import { DriverStatePanel } from '../../features/driver/DriverStatePanel';
import { DriverOffer } from '../../features/driver/DriverOffer';
import { type DriverConnection } from '../../features/driver/driverPresentation';
import { useVimaTheme } from '../../design/themes';
import { useDriverMap } from '../../features/driver/useDriverMap';
import { createDriverLocationSession, type DriverLocationStopReason } from './locationSession';
import { driverOperationId } from '../../services/matching/operationId';

export default function DriverLiveScreen() {
  return <LiveAccountGate role="driver">{session => <DriverSurface key={session.identity.accountId}
    client={session.matching} accountId={session.identity.accountId} available={session.identity.matchingAvailable} />}</LiveAccountGate>;
}
function DriverSurface({ client, accountId, available }: { client: MatchingClient; accountId: string;
  available: boolean }) {
  const theme = useVimaTheme();
  const queryClient = useQueryClient(); const key = ['driver', accountId];
  const state = useQuery({ queryKey: key, queryFn: ({ signal }) => client.driver(signal), enabled: available, retry: false,
    structuralSharing: (old, next) => old && (old as DriverState).revision >= (next as DriverState).revision ? old : next });
  const tripLifecycle = useDriverLifecycle(client, accountId, snapshot => queryClient.setQueryData<DriverState>(['driver', accountId],
    old => old && old.revision >= snapshot.revision ? old : snapshot));
  const latest = useRef(state.data);
  const tripOps = useRef(tripLifecycle);
  useLayoutEffect(() => { latest.current = state.data; tripOps.current = tripLifecycle; }, [state.data, tripLifecycle]);
  const syncTrip = tripLifecycle.sync;
  const connection = useSyncExternalStore(client.subscribeConnection, client.getConnection, client.getConnection);
  const [focused, setFocused] = useState(false); const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [permissionPromptActive, setPermissionPromptActive] = useState(false);
  const [error, setError] = useState(''); const [, refreshActions] = useState(0); const [now, setNow] = useState(() => Date.now());
  const [actions] = useState(() => createDriverActions(client, {
    changed: () => refreshActions(value => value + 1), error: setError,
    received: snapshot => queryClient.setQueryData<DriverState>(['driver', accountId], old => old && old.revision >= snapshot.revision ? old : snapshot),
    settled: () => { void queryClient.invalidateQueries({ queryKey: ['driver', accountId] }); },
  }));
  const { pending } = actions; const busy = actions.inFlight.current;
  useEffect(() => { actions.resume(); return () => actions.dispose(); }, [actions]);
  useLayoutEffect(() => { if (state.data) actions.receive(state.data); }, [actions, state.data]);
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
  const tracksLocation = availability === 'LOCATING' || availability === 'AVAILABLE' || availability === 'ASSIGNED';
  useEffect(() => { if (realtimeAllowed && connection === 'online') void syncTrip(); }, [realtimeAllowed, connection, syncTrip]);
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
      send: async (coordinate, heading, id, signal, capturedAt) => {
        if (latest.current?.assignment?.state === 'IN_PROGRESS') {
          await tripOps.current.telemetry(latest.current, coordinate, capturedAt ?? Date.now());
          return { availability: latest.current.availability, revision: latest.current.revision };
        }
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
  const data = state.data; const offer = data?.offer;
  const driverMap = useDriverMap(data, connection === 'online');
  return <SafeAreaView style={[styles.fill, { backgroundColor: theme.roles.background }]}><DriverRideShell {...driverMap} renderPhase={() => offer ?
    <DriverOffer offer={offer} revision={data!.revision} now={now} disabled={busy || !!pending.current}
      error={error} retryAvailable={!!pending.current} retryDisabled={busy}
      onAccept={() => { void actions.startDriverAction({ kind: 'offer_accept', offerId: offer.id, requestId: offer.requestId }); }}
      onReject={() => { void actions.startDriverAction({ kind: 'offer_reject', offerId: offer.id, requestId: offer.requestId }); }}
      onRetry={() => { void actions.retryPendingDriverAction(); }} />
    : <DriverStatePanel state={data} connection={connection as DriverConnection} configured={available}
    busy={busy || tripLifecycle.busy} error={error || tripLifecycle.error || (state.error ? 'No se pudo leer el estado.' : '')} retryAvailable={!!pending.current}
    lifecycleControls={data?.assignment ? <DriverLifecycleControls assignment={data.assignment} busy={tripLifecycle.busy || busy}
      queued={tripLifecycle.queued} pendingCommands={tripLifecycle.pendingCommands} onSync={() => { void tripLifecycle.sync(); }} onCommand={command => { void tripLifecycle.command(data, command); }} /> : null}
    onAvailable={() => { void actions.startDriverAction({ kind: 'availability_available' }); }}
    onOffline={() => { void actions.startDriverAction({ kind: 'availability_offline' }); }}
    onCancelAssignment={(requestId) => { void actions.startDriverAction({ kind: 'assignment_cancel', requestId, assignmentId: data!.assignment!.value.id }); }}
    onRetry={() => { void actions.retryPendingDriverAction(); }} />} /></SafeAreaView>;
}
const styles = StyleSheet.create({ fill: { flex: 1 } });
