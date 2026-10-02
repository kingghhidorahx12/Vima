import { Redirect } from 'expo-router';

/** Static DEV guard lets production bundling eliminate the fixture import. */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Conditional require is the release isolation boundary.
const FixtureScreen = __DEV__ ? require('../../src/dev/passenger/PassengerFixtureScreen').default : null;
export default function PassengerDevelopmentRoute() {
  return __DEV__ && FixtureScreen ? <FixtureScreen /> : <Redirect href="/" />;
}
