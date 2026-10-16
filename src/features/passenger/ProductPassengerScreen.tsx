import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import Storage from 'expo-sqlite/kv-store';
import { productRoleApi } from '../../services/auth/productRole';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { PassengerScreen } from './PassengerScreen';
import { passengerMapConfig } from './passengerMapConfig';

import { createGeospatialClient } from '../../services/geospatial/client';
import { geospatialClientConfig } from '../../services/geospatial/config';
import { createPassengerLiveGateway } from '../../services/geospatial/passengerGateway';
import { mobilePersonalPlaces } from '../../services/geospatial/mobilePersonalPlaces';
import { mobileInstallationId } from '../../services/geospatial/mobileInstallation';
import { locateCurrentPlace } from '../../services/location/currentPlace';
import { createMatchingClient, type MatchingClient } from '../../services/matching/client';
import type { MatchingIdentity } from '../../services/matching/contracts';
import { productAuthClient, ProductAuthClientError } from '../../services/auth/productSession';
import { ApiError } from '../../services/api/client';
import { RestorationSurface } from '../auth/AccessSurface';
import type { ApiClient } from '../../services/api/client';

interface ProductPassengerSession { api: ApiClient; matching: MatchingClient; identity: MatchingIdentity;
  auth: ReturnType<typeof productAuthClient>; generation: number }

/** Product account bootstrap. QA credentials remain behind LiveAccountGate. */
export default function ProductPassengerScreen() {
  const router = useRouter();
  const [session, setSession] = useState<ProductPassengerSession>();
  const [stage, setStage] = useState<'account' | 'identity'>('account');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(true);
  const connect = useCallback(async (signal?: AbortSignal) => {
    setBusy(true); setError(''); setStage('account');
    try {
      const auth = productAuthClient();
      const account = await auth.current(signal);
      if (signal?.aborted) return;
      if (!account) { router.replace('/auth' as Href); return; }
      const role = await Storage.getItem(`vima.product-context.v1.${account.accountId}`);
      if (signal?.aborted) return;
      if (role === 'driver') { router.replace('/driver' as Href); return; }
      setStage('identity');
      const matching = createMatchingClient(auth.api);
      const identity = await matching.identity(signal);
      if (identity.accountId !== account.accountId || identity.role !== 'passenger') {
        throw new Error('La identidad del servicio no coincide con esta cuenta.');
      }
      if (!signal?.aborted) setSession({ api: auth.api, matching, identity, auth, generation: auth.getSnapshot().generation });
    } catch (cause) {
      if (!signal?.aborted && (cause instanceof ProductAuthClientError && cause.status === 401 || cause instanceof ApiError && cause.status === 401)) {
        router.replace('/auth' as Href); return;
      }
      if (!signal?.aborted) {
        const code = cause instanceof ProductAuthClientError ? cause.code : '';
        setError(cause instanceof Error && cause.message === 'VIMA_API_BASE_URL_REQUIRED'
          ? 'El servicio de Vima aún no está configurado.'
          : code === 'timeout' ? 'El servicio tardó demasiado. Puedes reintentar sin cerrar tu sesión.'
          : code === 'network_recoverable' ? 'No hay conexión con el servicio. Revisa internet e inténtalo de nuevo.'
          : 'No se pudo validar tu sesión. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally { if (!signal?.aborted) setBusy(false); }
  }, [router]);
  useEffect(() => {
    const controller = new AbortController(); void Promise.resolve().then(() => connect(controller.signal));
    return () => controller.abort();
  }, [connect]);
  if (session) return <ProductSessionBoundary session={session} />;
  return <RestorationSurface stage={stage} error={error}
    onRetry={!busy ? () => { void connect(); } : undefined} onBack={() => router.replace('/auth' as Href)} />;
}

/** Invalidating auth removes the protected subtree before navigation effects run. */
function ProductSessionBoundary({ session }: { session: ProductPassengerSession }) {
  const [cache] = useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false } } }));
  const state = useSyncExternalStore(session.auth.subscribe, session.auth.getSnapshot, session.auth.getSnapshot);
  const router = useRouter(); const client = useQueryClient();
  const valid = state.status === 'authenticated' && state.generation === session.generation;
  useEffect(() => {
    if (valid) return;
    client.clear();
    // Account's explicit logout owns its completion/error UX; expiration must work while mounted too.
    if (state.status === 'closing' || state.reason === 'logout') return;
    router.dismissAll();
    router.replace((state.reason === 'expired' ? '/auth?notice=session_expired'
      : state.reason === 'storage' ? '/auth?notice=session_storage' : '/auth') as Href);
  }, [valid, state.status, state.reason, router, client]);
  useEffect(() => () => { void cache.cancelQueries(); cache.clear(); }, [cache]);
  return valid ? <QueryClientProvider client={cache}><AuthenticatedPassenger session={session} /></QueryClientProvider> : <RestorationSurface closing={state.reason === 'logout'} />;
}

function AuthenticatedPassenger({ session }: { session: ProductPassengerSession }) {
  const router = useRouter();
  const [scope] = useState(() => productRoleApi(session.api, () => session.auth.getSnapshot().generation === session.generation &&
    session.auth.getSnapshot().status === 'authenticated', 'passenger'));
  useEffect(() => () => scope.close(), [scope]);
  const [gateway] = useState(() => {
    const client = createGeospatialClient(scope.api, geospatialClientConfig.timeoutMs);
    return createPassengerLiveGateway(client, signal => locateCurrentPlace(signal, client.reverseGeocode),
      mobilePersonalPlaces, mobileInstallationId, process.env.EXPO_PUBLIC_VIMA_API_BASE_URL,
      { matching: createMatchingClient(scope.api, { context: 'passenger' }), accountId: session.identity.accountId, available: session.identity.matchingAvailable,
        pickupAdjustmentMaxMeters: session.identity.pickupAdjustmentMaxMeters });
  });
  return <PassengerScreen gateway={gateway} mapConfig={passengerMapConfig} boundaries={{ call() {}, safety() {},
    account: () => router.push('/account' as Href),
    renderRestoration: ({ ready, error, retry }) => ready ? null : <View testID="product-trip-restoration" style={styles.restoration}>
      <RestorationSurface stage="trip" error={error ? 'No pudimos recuperar tu viaje. Revisa internet y reintenta sin cerrar tu sesión.' : ''} onRetry={retry} />
    </View>,
  }} />;
}

const styles = StyleSheet.create({ restoration: { ...StyleSheet.absoluteFill, zIndex: 30 } });
