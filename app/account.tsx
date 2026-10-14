import { Redirect, type Href } from 'expo-router';
import { ProductAccountScreen } from '../src/features/auth/ProductAccountScreen';
export default function ProductAccountRoute() {
  if (process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product' && process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa') return <Redirect href={'/qa/passenger' as Href} />;
  if (process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product' && __DEV__) return <Redirect href={'/dev/passenger' as Href} />;
  return <ProductAccountScreen />;
}
