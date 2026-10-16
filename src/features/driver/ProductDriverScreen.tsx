import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, BackHandler, View, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Storage from 'expo-sqlite/kv-store';
import { productAuthClient } from '../../services/auth/productSession';
import { productRoleApi, driverExit } from '../../services/auth/productRole';
import { createMatchingClient } from '../../services/matching/client';
import { ApiError } from '../../services/api/client';
import { DriverSurface } from './DriverOperationalSurface';
import { AccessFrame, AccessNotice, RestorationSurface } from '../auth/AccessSurface';
import { VimaButton } from '../../design/components/VimaButton';

export function ProductDriverScreen() {
  const router = useRouter(); const auth = productAuthClient();
  const identity = useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot);
  const [attempt, retry] = useState(0); const [error, setError] = useState(''); const [denied, setDenied] = useState(false);
  const owner = useRef<string | undefined>(undefined); const mounted = useRef(true);
  const [restricted, setRestricted] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [session, setSession] = useState<{
    generation: number; id: string; scope: ReturnType<typeof productRoleApi>;
    matching: ReturnType<typeof createMatchingClient>; cache: QueryClient; exit: ReturnType<typeof driverExit>;
  }>();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let active = true; let cleanup = () => {};
    void (async () => {
      await Promise.resolve(); if (!active) return;
      setSession(undefined); setError(''); setDenied(false);
      try {
        const account = await auth.current(controller.signal, true);
        if (!active) return;
        if (!account) { router.replace('/auth' as Href); return; }
        owner.current = account.accountId; setRestricted(!account.capabilities.includes('driver'));
        const generation = auth.getSnapshot().generation;
        const scope = productRoleApi(auth.api, () => auth.getSnapshot().generation === generation && auth.getSnapshot().status === 'authenticated', 'driver', () => {
          if (active) { scope.close(); setDenied(true); setError('El acceso Driver cambió. Revisa tu autorización antes de continuar.'); }
        });
        const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
        cleanup = () => { scope.close(); void cache.cancelQueries(); cache.clear(); };
        const matching = createMatchingClient(scope.api, { context: 'driver' });
        const state = await matching.driver(controller.signal);
        if (state.accountId !== account.accountId || !state.profile.vehicle.name || !state.profile.vehicle.plate || !state.profile.vehicle.color ||
          !account.capabilities.includes('driver') && !state.assignment) throw new ApiError(403, 'driver_not_authorized');
        if (!active) return;
        cache.setQueryData(['driver', account.accountId], state);
        await Storage.setItem(`vima.product-context.v1.${account.accountId}`, 'driver');
        if (active) setSession({ generation, id: account.accountId, scope, cache, matching, exit: driverExit(matching) });
      } catch (cause) {
        if (!active) return;
        cleanup(); setDenied(cause instanceof ApiError && cause.status === 403);
        setError('No se pudo abrir Driver. Revisa conexión y autorización; no se ha cambiado tu disponibilidad.');
      }
    })();
    return () => { active = false; controller.abort(); cleanup(); };
  }, [auth, router, attempt]);
  const valid = session && identity.status === 'authenticated' && identity.generation === session.generation;
  useEffect(() => {
    if (session && !valid) { session.scope.close(); session.cache.clear(); }
    if (identity.status === 'signed-out' || identity.status === 'storage-blocked') router.replace('/auth' as Href);
  }, [session, valid, router, identity.status]);
  const leave = async (path = '/passenger') => {
    if (leaving) return; setLeaving(true); setError('');
    try {
      if (!session && !denied) throw new Error('driver_offline_unconfirmed');
      if (session && !denied) await session.exit();
      if (owner.current) await Storage.removeItem(`vima.product-context.v1.${owner.current}`);
      if (session) {
        if (auth.getSnapshot().generation !== session.generation || auth.getSnapshot().status !== 'authenticated') return;
        session.scope.close(); session.cache.clear();
      }
      if (mounted.current) { router.dismissAll(); router.replace(path as Href); }
    } catch (cause) { setError(cause instanceof Error && cause.message === 'driver_trip_active'
      ? 'Tienes un viaje activo. Termínalo y resuelve el efectivo antes de cambiar de contexto.'
      : 'Desconexión sin confirmar. Continúas en Driver; reintenta con conexión.'); }
    finally { setLeaving(false); }
  };
  useEffect(() => { const back = BackHandler.addEventListener('hardwareBackPress', () => { void leave(); return true; });
    return () => back.remove(); });
  useEffect(() => {
    if (!valid || denied) return;
    let active = true; let refreshing = false; const controller = new AbortController();
    const refresh = async () => {
      if (refreshing) return; refreshing = true;
      try { const account = await auth.current(controller.signal, true);
        if (active && account?.accountId === session.id) setRestricted(!account.capabilities.includes('driver'));
        if (active) await session.matching.driver();
      } catch { /* Network failure preserves the session; server 403 closes the scope. */ }
      finally { refreshing = false; }
    };
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 25_000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; controller.abort(); clearInterval(timer); subscription.remove(); };
  }, [session, valid, denied, auth]);
  if (identity.status === 'closing' || identity.status === 'signed-out' || identity.status === 'storage-blocked') return <RestorationSurface closing />;
  if (!valid || denied) return <AccessFrame title="Acceso Driver">
    {error ? <AccessNotice>{error}</AccessNotice> : <RestorationSurface />}
    <VimaButton label="Reintentar" onPress={() => retry(n => n + 1)} />
    {denied ? <VimaButton secondary label="Volver a Passenger" onPress={() => { void leave(); }} /> : null}
  </AccessFrame>;
  return <QueryClientProvider client={session.cache}><View style={styles.fill}>
    <DriverSurface product restricted={restricted} client={session.matching} accountId={session.id} available
      onLeave={() => { void leave(); }} onSession={() => { void leave('/account'); }} />
    {error ? <View style={styles.notice}><AccessNotice>{error}</AccessNotice><VimaButton secondary label="Entendido" onPress={() => setError('')} /></View> : null}
    {leaving ? <View style={StyleSheet.absoluteFill} accessibilityViewIsModal><RestorationSurface closing /></View> : null}
  </View></QueryClientProvider>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, notice: { position: 'absolute', top: 60, left: 16, right: 16 } });
