import { Link, Redirect, useLocalSearchParams } from 'expo-router';

const Gate = process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa' && process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product'
  ? require('../../src/dev/LiveAccountGate').LiveAccountGate : null; // eslint-disable-line @typescript-eslint/no-require-imports -- QA-only tools are excluded from product.
/** Internal QA deep link; never an overlay in the operational map. */
export default function QaAccountTools() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  return Gate ? <Gate role={role === 'driver' ? 'driver' : 'passenger'} accountTools>
    {() => <Link href={role === 'driver' ? './driver' : './passenger'}>Volver al mapa</Link>}
  </Gate> : <Redirect href="/" />;
}
