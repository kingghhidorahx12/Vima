import { useEffect } from 'react';
import { View } from 'react-native';
import { VimaText } from '../../design/primitives';
import { VimaButton } from '../../design/components/VimaButton';
import type { DriverState } from '../../services/matching/contracts';
import { matchingDevTrace, type MatchingTrace } from '../../services/matching/devTrace';

/** Critical offer content never participates in the secondary Driver ScrollView. */
export function DriverOffer({ offer, revision, now, disabled, onAccept, onReject, trace = matchingDevTrace }: {
  offer: NonNullable<DriverState['offer']>; revision: number; now: number; disabled: boolean;
  onAccept: () => void; onReject: () => void; trace?: MatchingTrace;
}) {
  const { id, requestId, expiresAt } = offer;
  useEffect(() => { trace('offer_render', { offerId: id, requestId, revision, expiresAt }); }, [id, requestId, revision, expiresAt, trace]);
  return <View testID="driver-critical-offer" style={{ padding: 16, gap: 12 }}>
    <VimaText variant="h3">Oferta · {Math.max(0, Math.ceil((expiresAt - now) / 1000))} s</VimaText>
    <VimaText variant="bodyRegular" numberOfLines={2}>{offer.pickup.name} · {offer.pickup.address}</VimaText>
    <VimaText variant="bodyRegular">Recogida a {offer.etaMinutes} min</VimaText>
    <VimaButton label="Aceptar" disabled={disabled || now >= expiresAt} onPress={onAccept} />
    <VimaButton secondary label="Rechazar" disabled={disabled || now >= expiresAt} onPress={onReject} />
  </View>;
}
