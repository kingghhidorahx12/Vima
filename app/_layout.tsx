import { Stack } from 'expo-router';
import { RootProviders } from '../src/providers/RootProviders';

export default function RootLayout() {
  return <RootProviders><Stack screenOptions={{ headerShown: false, animation: 'none' }} /></RootProviders>;
}
