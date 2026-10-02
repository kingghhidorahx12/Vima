import { Redirect } from 'expo-router';

export default function Index() {
  if (__DEV__) return <Redirect href="./dev/passenger" />;
  // Passenger presentation exists; production gateway/map/assets are still not supplied.
  return null;
}
