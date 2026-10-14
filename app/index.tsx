import { Redirect, type Href } from 'expo-router';

export default function Index() {
  if (process.env.EXPO_PUBLIC_VIMA_AUTH_MODE === 'product') return <Redirect href="./auth" />;
  if (process.env.EXPO_PUBLIC_VIMA_VARIANT === 'qa') return <Redirect href="./qa/passenger" />;
  if (__DEV__) return <Redirect href="./dev/passenger" />;
  return <Redirect href={'/auth' as Href} />;
}
