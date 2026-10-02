import * as Location from 'expo-location';
import type { Place } from '../../features/passenger/model';

/** Foreground, one-shot location. A denial/failure leaves manual entry available. */
export async function locateCurrentPlace(signal?: AbortSignal): Promise<Place | null> {
  signal?.throwIfAborted();
  const permission = await Location.requestForegroundPermissionsAsync();
  signal?.throwIfAborted();
  if (!permission.granted) return null;
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  signal?.throwIfAborted();
  let address = '';
  try {
    const [reference] = await Location.reverseGeocodeAsync(coords);
    if (reference) address = [reference.street, reference.streetNumber, reference.district, reference.city]
      .filter(Boolean).join(', ');
  } catch { /* Coordinates remain useful when the device geocoder has no address. */ }
  signal?.throwIfAborted();
  return { id: `current-location:${coords.longitude}:${coords.latitude}`, name: 'Tu ubicación actual', address,
    coordinate: [coords.longitude, coords.latitude] };
}
