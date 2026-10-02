import * as Location from 'expo-location';
import type { Place } from '../../features/passenger/model';
import type { GeospatialClient } from '../geospatial/client';
import { GeospatialError } from '../geospatial/contracts';

function ensureActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new GeospatialError('cancelled');
}

/** Foreground, one-shot location. A denial/failure leaves manual entry available. */
export async function locateCurrentPlace(signal?: AbortSignal, reverse?: GeospatialClient['reverseGeocode']): Promise<Place | null> {
  ensureActive(signal);
  const permission = await Location.requestForegroundPermissionsAsync();
  ensureActive(signal);
  if (!permission.granted) return null;
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  ensureActive(signal);
  let address = '';
  try {
    if (reverse) address = (await reverse([coords.longitude, coords.latitude], signal))?.address ?? '';
    else {
      const [reference] = await Location.reverseGeocodeAsync(coords);
      if (reference) address = [reference.street, reference.streetNumber, reference.district, reference.city].filter(Boolean).join(', ');
    }
  } catch { /* Coordinates remain useful when the device geocoder has no address. */ }
  ensureActive(signal);
  return { id: `current-location:${coords.longitude}:${coords.latitude}`, name: 'Tu ubicación actual', address,
    coordinate: [coords.longitude, coords.latitude] };
}
