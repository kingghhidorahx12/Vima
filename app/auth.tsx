import { Redirect, type Href } from 'expo-router';
import { ProductAuthScreen } from '../src/features/auth/ProductAuthScreen';

export default function ProductAuthRoute() {
  if (process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product' && process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa') return <Redirect href={'/qa/passenger' as Href} />;
  if (process.env.EXPO_PUBLIC_VIMA_AUTH_MODE !== 'product' && __DEV__) return <Redirect href={'/dev/passenger' as Href} />;
  return <ProductAuthScreen />;
}
