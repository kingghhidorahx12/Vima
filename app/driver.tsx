import { Redirect, type Href } from 'expo-router';
import { ProductDriverScreen } from '../src/features/driver/ProductDriverScreen';
export default function DriverRoute() {
  if (process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product') return <Redirect href={'/passenger' as Href} />;
  return <ProductDriverScreen />;
}
