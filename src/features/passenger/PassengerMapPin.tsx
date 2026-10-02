import { Marker } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';
import { visualTokens as t } from '../../design/tokens';
import type { Place } from './model';

/** Native MapLibre marker with the approved origin/destination color semantics. */
export function PassengerMapPin({ place, kind }: { place: Place; kind: 'origin' | 'destination' }) {
  const color = kind === 'origin' ? t.colors.green : t.colors.red;
  return <Marker id={`passenger-${kind}-pin`} lngLat={[...place.coordinate]} anchor="bottom">
    <View accessible={false} style={styles.footprint}>
      <View style={[styles.pin, { backgroundColor: color }]} />
      <View style={[styles.inner, { backgroundColor: t.colors.white }]} />
    </View>
  </Marker>;
}

/** Home location dot and halo, distinct from a confirmed origin pin. */
export function PassengerUserLocation({ place }: { place: Place }) {
  return <Marker id="passenger-user-location" lngLat={[...place.coordinate]}>
    <View accessible={false} style={styles.locationHalo}>
      <View style={styles.locationRing}><View style={styles.locationDot} /></View>
    </View>
  </Marker>;
}

const size = t.components.iconSizesPx[2]!;
const styles = StyleSheet.create({
  footprint: { width: size, height: size + t.spacing.scalePx[0]!, alignItems: 'center', justifyContent: 'flex-start' },
  pin: { width: size, height: size, borderRadius: t.radii.pillPx, transform: [{ rotate: '45deg' }],
    borderBottomRightRadius: t.radii.smallPx / 2 },
  inner: { position: 'absolute', top: t.spacing.scalePx[1], width: t.spacing.scalePx[1], height: t.spacing.scalePx[1],
    borderRadius: t.radii.pillPx },
  locationHalo: { width: t.spacing.scalePx[8], height: t.spacing.scalePx[8], borderRadius: t.radii.pillPx,
    borderWidth: t.borders.standardWidthPx, borderColor: t.colors.blue, alignItems: 'center', justifyContent: 'center' },
  locationRing: { width: t.spacing.scalePx[6], height: t.spacing.scalePx[6], borderRadius: t.radii.pillPx,
    borderWidth: t.borders.standardWidthPx, borderColor: t.colors.blue, alignItems: 'center', justifyContent: 'center' },
  locationDot: { width: t.components.iconSizesPx[0], height: t.components.iconSizesPx[0], borderRadius: t.radii.pillPx,
    backgroundColor: t.colors.blue, borderWidth: t.borders.standardWidthPx, borderColor: t.colors.white },
});
