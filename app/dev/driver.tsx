import { Redirect } from 'expo-router';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Technical surface is absent from release.
const Driver = __DEV__ && process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product' ? require('../../src/dev/driver/DriverLiveScreen').default : null;
export default function DriverDevelopmentRoute() { return __DEV__ && Driver ? <Driver /> : <Redirect href="/" />; }
