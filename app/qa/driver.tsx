import { Redirect } from 'expo-router';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Static QA boundary removes live entry from production.
const Live = process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' ? require('../../src/dev/driver/DriverLiveScreen').default : null;
export default function QaRoute() { return Live ? <Live /> : <Redirect href="/" />; }
