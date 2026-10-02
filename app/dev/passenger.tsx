import { Redirect } from 'expo-router';
import { Text } from 'react-native';
import { resolveGeoMode } from '../../src/services/geospatial/config';

/** Static DEV guard lets production bundling eliminate the fixture import. */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Conditional require is the release isolation boundary.
const FixtureScreen = __DEV__ && process.env.EXPO_PUBLIC_VIMA_FIXTURES === '1' ? require('../../src/dev/passenger/PassengerFixtureScreen').default : null;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- DEV entry; release keeps its existing entry boundary.
const LiveScreen = __DEV__ ? require('../../src/dev/passenger/PassengerLiveScreen').default : null;
export default function PassengerDevelopmentRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  const mode = resolveGeoMode(__DEV__, process.env.EXPO_PUBLIC_VIMA_FIXTURES, process.env.EXPO_PUBLIC_VIMA_API_BASE_URL);
  if (mode === 'fixture' && FixtureScreen) return <FixtureScreen />;
  if (mode === 'live' && LiveScreen) return <LiveScreen />;
  return <Text accessibilityRole="alert">Configura EXPO_PUBLIC_VIMA_API_BASE_URL o activa EXPO_PUBLIC_VIMA_FIXTURES=1 para desarrollo.</Text>;
}
