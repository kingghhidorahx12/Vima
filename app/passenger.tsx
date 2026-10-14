import { Redirect, type Href } from 'expo-router';
import ProductPassengerScreen from '../src/features/passenger/ProductPassengerScreen';

export default function ProductPassengerRoute() {
  if (process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product' && process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa') return <Redirect href={'/qa/passenger' as Href} />;
  if (process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product' && __DEV__) return <Redirect href={'/dev/passenger' as Href} />;
  return <ProductPassengerScreen />;
}
