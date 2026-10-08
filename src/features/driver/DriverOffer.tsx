import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { useVimaTheme } from '../../design/themes';
import { elevationStyle } from '../../design/themes/light';
import { visualTokens as t } from '../../design/tokens';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { motionTimings } from '../../motion/timing';
import type { DriverState } from '../../services/matching/contracts';
import { matchingDevTrace, type MatchingTrace } from '../../services/matching/devTrace';

/** Product offer surface. Context and actions are bounded and never participate in a ScrollView. */
export function DriverOffer({ offer, revision, now, disabled, error = '', retryAvailable = false,
  retryDisabled = false, onAccept, onReject, onRetry = () => {}, trace = matchingDevTrace }: {
  offer: NonNullable<DriverState['offer']>; revision: number; now: number; disabled: boolean;
  error?: string; retryAvailable?: boolean; retryDisabled?: boolean; onAccept: () => void; onReject: () => void;
  onRetry?: () => void; trace?: MatchingTrace;
}) {
  const theme = useVimaTheme();
  const { id, requestId, expiresAt } = offer;
  const expired = now >= expiresAt;
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  useEffect(() => { trace('offer_render', { offerId: id, requestId, revision, expiresAt }); }, [id, requestId, revision, expiresAt, trace]);
  return <ElementEntrance testID="driver-critical-offer" timing={motionTimings.state}
    style={[styles.surface, { backgroundColor: theme.roles.surface }]}>
    <View testID="driver-offer-context" style={styles.context}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <View style={[styles.stateMark, { backgroundColor: theme.roles.positive }]} />
          <VimaText variant="h2" style={styles.title}>Nueva solicitud</VimaText>
        </View>
        <View style={[styles.countdown, { backgroundColor: theme.roles.warningWash }]} accessibilityLabel={`${seconds} segundos restantes`}>
          <VimaText variant="h3" style={{ color: theme.roles.warning }}>{seconds} s</VimaText>
        </View>
      </View>
      <View accessible accessibilityLabel={`Recogida: ${offer.pickup.name}. ${offer.pickup.address}. A ${offer.etaMinutes} minutos.`}
        style={[styles.pickup, { backgroundColor: theme.roles.elevatedSurface,
          ...elevationStyle('level1', theme.roles.shadow) }]}>
        <VimaGlyph name="route" color={theme.roles.positive} />
        <View style={styles.pickupCopy}>
          <VimaText variant="caption" style={{ color: theme.roles.textSecondary }}>Recogida</VimaText>
          <VimaText variant="bodyMedium" numberOfLines={1}>{offer.pickup.name}</VimaText>
          <VimaText variant="bodySmall" numberOfLines={2} style={{ color: theme.roles.textSecondary }}>{offer.pickup.address}</VimaText>
          <VimaText variant="bodyMedium" style={{ color: theme.roles.positiveStrong }}>A {offer.etaMinutes} min</VimaText>
        </View>
      </View>
    </View>
    <View testID="driver-offer-critical-actions" style={[styles.actionZone, { borderTopColor: theme.roles.border }]}>
      {error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: theme.roles.dangerWash }]}>
        <VimaGlyph name="warning" color={theme.roles.danger} />
        <VimaText variant="bodySmall" numberOfLines={2} style={styles.errorCopy}>{error}</VimaText>
      </View> : null}
      {retryAvailable ? <VimaButton secondary label="Reintentar acción" disabled={retryDisabled} onPress={onRetry} /> : null}
      <VimaButton label="Aceptar" disabled={disabled || expired} onPress={onAccept} />
      <VimaButton secondary danger label="Rechazar" disabled={disabled || expired} onPress={onReject} />
    </View>
  </ElementEntrance>;
}

const styles = StyleSheet.create({
  surface: { paddingHorizontal: t.spacing.mobileHorizontalMarginPx, paddingTop: t.spacing.scalePx[3],
    paddingBottom: t.spacing.scalePx[3], gap: t.spacing.scalePx[2] },
  context: { gap: t.spacing.scalePx[2], flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.scalePx[2] },
  titleGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[2] },
  title: { flexShrink: 1 },
  stateMark: { width: 6, height: 36, borderRadius: t.radii.pillPx },
  countdown: { minWidth: 72, minHeight: 48, paddingHorizontal: t.spacing.scalePx[2], borderRadius: t.radii.pillPx,
    alignItems: 'center', justifyContent: 'center' },
  pickup: { flexDirection: 'row', gap: t.spacing.scalePx[2], padding: t.spacing.scalePx[2], borderRadius: t.radii.cardPx },
  pickupCopy: { flex: 1, minWidth: 0, gap: t.spacing.scalePx[0] },
  actionZone: { gap: t.spacing.scalePx[1], paddingTop: t.spacing.scalePx[2], borderTopWidth: t.borders.standardWidthPx,
    flexShrink: 0 },
  error: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[1],
    padding: t.spacing.scalePx[2], borderRadius: t.radii.fieldPx },
  errorCopy: { flex: 1 },
});
