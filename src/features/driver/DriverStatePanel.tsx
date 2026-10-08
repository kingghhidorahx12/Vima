import { ScrollView, StyleSheet, View } from 'react-native';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { useVimaTheme } from '../../design/themes';
import { elevationStyle } from '../../design/themes/light';
import { visualTokens as t } from '../../design/tokens';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { motionTimings } from '../../motion/timing';
import type { DriverState } from '../../services/matching/contracts';
import { driverConnectionLabel, driverGpsLabel, driverPresentation, type DriverConnection } from './driverPresentation';

export function DriverStatePanel({ state, connection, configured, busy, error, retryAvailable,
  onAvailable, onOffline, onCancelAssignment, onRetry }: {
  state?: DriverState; connection: DriverConnection; configured: boolean; busy: boolean; error: string;
  retryAvailable: boolean; onAvailable: () => void; onOffline: () => void;
  onCancelAssignment: (requestId: string) => void; onRetry: () => void;
}) {
  const theme = useVimaTheme();
  const presentation = driverPresentation(state);
  const gps = driverGpsLabel(state, error);
  const network = driverConnectionLabel(connection);
  const assignment = state?.assignment;
  const disabled = busy || retryAvailable || !configured;
  const action = () => {
    if (presentation.action === 'availability_available') onAvailable();
    else if (presentation.action === 'availability_offline') onOffline();
    else if (presentation.action === 'assignment_cancel' && assignment) onCancelAssignment(assignment.requestId);
  };
  return <ElementEntrance key={presentation.availability} timing={motionTimings.state}
    testID={`driver-surface-${presentation.variant}`} style={[styles.surface, { backgroundColor: theme.roles.surface }]}>
    <View testID="driver-state-context" style={styles.context}>
      <View style={styles.headingRow}>
        <View style={[styles.stateMark, { backgroundColor: presentation.tone === 'neutral' ? theme.roles.control
          : presentation.tone === 'positive' ? theme.roles.positive : presentation.tone === 'warning'
            ? theme.roles.warning : theme.roles.danger }]} />
        <View style={styles.headingCopy}>
          <VimaText variant="h2">{presentation.title}</VimaText>
          <VimaText variant="bodyRegular" style={{ color: theme.roles.textSecondary }}>{presentation.copy}</VimaText>
        </View>
      </View>
      <View style={styles.statusRow}>
        <DriverStatus icon="recenter" label={gps.label} tone={gps.tone} />
        <DriverStatus icon={network.tone === 'critical' ? 'warning' : 'check'} label={network.label} tone={network.tone} />
      </View>
      {assignment ? <View style={[styles.pickup, { backgroundColor: theme.roles.elevatedSurface,
        ...elevationStyle('level1', theme.roles.shadow) }]}>
        <VimaGlyph name="route" color={theme.roles.positive} />
        <View style={styles.pickupCopy}>
          <VimaText variant="bodyMedium">Recogida</VimaText>
          <VimaText variant="bodySmall" numberOfLines={2} style={{ color: theme.roles.textSecondary }}>
            {assignment.pickup.name} · {assignment.pickup.address}
          </VimaText>
          <VimaText variant="caption" style={{ color: theme.roles.textSecondary }}>Llegada estimada: {assignment.value.etaMinutes} min</VimaText>
        </View>
      </View> : null}
    </View>
    {presentation.variant === 'operational' && assignment ? <ScrollView testID="driver-secondary-content"
      style={styles.secondary} contentContainerStyle={styles.secondaryContent}>
      <VimaText variant="caption" style={{ color: theme.roles.textSecondary }}>Vehículo asignado</VimaText>
      <VimaText variant="bodySmall">{assignment.value.vehicle.name} · {assignment.value.vehicle.color}</VimaText>
    </ScrollView> : null}
    <View testID="driver-critical-region" style={[styles.actionZone, { borderTopColor: theme.roles.border }]}>
      {error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: theme.roles.dangerWash }]}>
        <VimaGlyph name="warning" color={theme.roles.danger} />
        <VimaText variant="bodySmall" numberOfLines={2} style={styles.errorCopy}>{error}</VimaText>
      </View> : null}
      {presentation.actionLabel ? <VimaButton label={presentation.actionLabel} secondary={presentation.action !== 'availability_available'}
        danger={presentation.action === 'assignment_cancel'} loading={busy} disabled={disabled} onPress={action} /> : null}
      {retryAvailable ? <VimaButton secondary label="Reintentar acción" disabled={busy} onPress={onRetry} /> : null}
    </View>
  </ElementEntrance>;
}

function DriverStatus({ icon, label, tone }: { icon: VimaGlyphName; label: string;
  tone: 'positive' | 'warning' | 'critical' | 'location' }) {
  const theme = useVimaTheme();
  const color = tone === 'positive' ? theme.roles.positiveStrong : tone === 'warning' ? theme.roles.warning
    : tone === 'critical' ? theme.roles.danger : theme.roles.location;
  return <View style={[styles.status, { backgroundColor: theme.roles.subtleSurface }]}>
    <VimaGlyph name={icon} color={color} size={t.components.iconSizesPx[1]} />
    <VimaText variant="caption" numberOfLines={1}>{label}</VimaText>
  </View>;
}

const styles = StyleSheet.create({
  surface: { paddingHorizontal: t.spacing.mobileHorizontalMarginPx, paddingTop: t.spacing.scalePx[3],
    paddingBottom: t.spacing.scalePx[3], gap: t.spacing.scalePx[2] },
  context: { gap: t.spacing.scalePx[2], flexShrink: 1 },
  actionZone: { gap: t.spacing.scalePx[1], paddingTop: t.spacing.scalePx[2], borderTopWidth: t.borders.standardWidthPx,
    flexShrink: 0 },
  headingRow: { flexDirection: 'row', gap: t.spacing.scalePx[2], alignItems: 'flex-start' },
  headingCopy: { flex: 1, gap: t.spacing.scalePx[1] },
  stateMark: { width: 6, minHeight: 52, borderRadius: t.radii.pillPx },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.scalePx[1] },
  status: { minHeight: 36, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[1],
    paddingHorizontal: t.spacing.scalePx[2], borderRadius: t.radii.pillPx },
  pickup: { flexDirection: 'row', gap: t.spacing.scalePx[2], padding: t.spacing.scalePx[2], borderRadius: t.radii.cardPx },
  pickupCopy: { flex: 1, gap: t.spacing.scalePx[0] },
  error: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[1], padding: t.spacing.scalePx[2],
    borderRadius: t.radii.fieldPx },
  errorCopy: { flex: 1 },
  secondary: { maxHeight: 64, flexShrink: 1 },
  secondaryContent: { paddingVertical: t.spacing.scalePx[1], gap: t.spacing.scalePx[0] },
});
