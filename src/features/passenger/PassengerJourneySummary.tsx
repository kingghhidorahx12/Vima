import { StyleSheet, View } from 'react-native';
import { VimaText } from '../../design/primitives';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { VimaButton } from '../../design/components/VimaButton';
import { useVimaTheme } from '../../design/themes';
import { passengerSurfaces } from '../../design/presentation';
import { visualTokens as t } from '../../design/tokens';
import { PlaceThumbnail } from './PlaceThumbnail';
import type { PassengerGateway, PassengerTrip, Place } from './model';

/** Read-only destination: no second selection or invented media. */
export function DestinationSummary({ place, resolveMedia }: { place: Place; resolveMedia?: PassengerGateway['resolvePlaceMedia'] }) {
  const theme = useVimaTheme();
  return <View testID="passenger-destination-summary" style={[styles.destination, { backgroundColor: theme.roles.elevatedSurface, borderColor: theme.roles.border }]}>
    <PlaceThumbnail place={place} resolveMedia={resolveMedia} size={56} />
    <View style={styles.fill}><VimaText variant="bodyMedium">{place.name}</VimaText>
      <VimaText variant="bodySmall" numberOfLines={2} style={{ color: theme.roles.textSecondary }}>{place.address}</VimaText></View>
  </View>;
}

export function JourneyStatus({ trip }: { trip: PassengerTrip }) {
  const theme = useVimaTheme(); const state = trip.requestState;
  const title = state === 'IN_PROGRESS' ? 'Viaje en curso' : state === 'PAYMENT_PENDING' ? 'Pago pendiente'
    : state === 'ARRIVED_PICKUP' ? 'Tu conductor llegó' : 'Tu conductor va en camino';
  return <View testID="passenger-journey-status" style={styles.heading} accessibilityLiveRegion="polite">
    <VimaText variant="h3">{title}</VimaText>
    <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>
      {state === 'IN_PROGRESS' ? `Hacia ${trip.quote.destination.name}` : state === 'PAYMENT_PENDING'
        ? 'El conductor confirmará el pago en efectivo.' : state === 'ARRIVED_PICKUP'
          ? 'Comparte tu código al encontrarte con el conductor.' : trip.assignment ? `Tiempo estimado de recogida: ${trip.assignment.etaMinutes} min` : 'Esperando información del conductor.'}
    </VimaText>
  </View>;
}

export function JourneyClosure({ trip, onHome }: { trip: PassengerTrip; onHome: () => void }) {
  const theme = useVimaTheme(); const completed = trip.phase === 'completed'; const settlement = trip.lifecycle?.settlement;
  const total = settlement ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(settlement.price.totalMinor / 100) : undefined;
  return <View testID="passenger-journey-closure" style={styles.heading}>
    <View style={[styles.symbol, { backgroundColor: completed ? theme.roles.positiveWash : theme.roles.subtleSurface }]}>
      <VimaGlyph name={completed ? 'check' : 'info'} size={32} color={completed ? theme.roles.positiveStrong : theme.roles.control} />
    </View>
    <VimaText variant="h3" style={styles.center}>{completed ? settlement?.kind === 'early' ? 'Viaje finalizado' : '¡Llegaste a tu destino!' : trip.phase === 'cancelled' ? 'Viaje cancelado' : 'No encontramos un conductor'}</VimaText>
    <VimaText variant="bodySmall" style={[styles.center, { color: theme.roles.textSecondary }]}>
      {completed ? 'Gracias por viajar con Vima.' : 'Puedes regresar al inicio para preparar otro viaje.'}
    </VimaText>
    {completed && settlement ? <View testID="passenger-settlement-summary" style={[styles.receipt, { backgroundColor: theme.roles.subtleSurface, borderColor: theme.roles.border }]}>
      <VimaText variant="bodyMedium">{total} · Total en efectivo</VimaText>
      <VimaText variant="bodySmall">{Math.round(settlement.metrics.durationSeconds / 60)} min · {(settlement.metrics.distanceMeters / 1000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} km confirmados</VimaText>
      {trip.lifecycle?.disputeId ? <VimaText variant="caption" selectable>Referencia de pago: {trip.lifecycle.disputeId}</VimaText> : null}
    </View> : null}
    <VimaButton label="Volver al inicio" onPress={onHome} />
  </View>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, center: { textAlign: 'center' },
  destination: { ...passengerSurfaces.card, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  heading: { gap: 12 }, receipt: { ...passengerSurfaces.card, padding: 16, gap: 8 },
  symbol: { width: 72, height: 72, borderRadius: t.radii.pillPx, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' },
});
