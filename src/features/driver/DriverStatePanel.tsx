import { ScrollView, StyleSheet, View } from 'react-native';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaGlyph, type VimaGlyphName } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { useVimaTheme } from '../../design/themes';
import { darkThemeColors } from '../../design/themes/dark';
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
  const dark = theme.name === 'dark';
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
    testID={`driver-surface-${presentation.variant}`} style={[styles.surface, dark && styles.surfaceDark]}>
    <View testID="driver-critical-region" style={styles.critical}>
      <View style={styles.headingRow}>
        <View style={[styles.stateMark, toneStyle[presentation.tone]]} />
        <View style={styles.headingCopy}>
          <VimaText variant="h2">{presentation.title}</VimaText>
          <VimaText variant="bodyRegular" style={dark && styles.secondaryDark}>{presentation.copy}</VimaText>
        </View>
      </View>
      <View style={styles.statusRow}>
        <DriverStatus icon="recenter" label={gps.label} tone={gps.tone} dark={dark} />
        <DriverStatus icon={network.tone === 'critical' ? 'warning' : 'check'} label={network.label} tone={network.tone} dark={dark} />
      </View>
      {assignment ? <View style={[styles.pickup, dark && styles.cardDark]}>
        <VimaGlyph name="route" color={t.colors.green} />
        <View style={styles.pickupCopy}>
          <VimaText variant="bodyMedium">Recogida</VimaText>
          <VimaText variant="bodySmall" numberOfLines={2} style={dark && styles.secondaryDark}>
            {assignment.pickup.name} · {assignment.pickup.address}
          </VimaText>
          <VimaText variant="caption" style={dark && styles.secondaryDark}>Llegada estimada: {assignment.value.etaMinutes} min</VimaText>
        </View>
      </View> : null}
      {error ? <View accessibilityRole="alert" style={[styles.error, dark && styles.errorDark]}>
        <VimaGlyph name="warning" color={t.colors.red} />
        <VimaText variant="bodySmall" numberOfLines={2} style={styles.errorCopy}>{error}</VimaText>
      </View> : null}
      {presentation.actionLabel ? <VimaButton label={presentation.actionLabel} secondary={presentation.action !== 'availability_available'}
        danger={presentation.action === 'assignment_cancel'} loading={busy} disabled={disabled} onPress={action} /> : null}
      {retryAvailable ? <VimaButton secondary label="Reintentar acción" disabled={busy} onPress={onRetry} /> : null}
    </View>
    {presentation.variant === 'operational' && assignment ? <ScrollView testID="driver-secondary-content"
      style={styles.secondary} contentContainerStyle={styles.secondaryContent}>
      <VimaText variant="caption" style={dark && styles.secondaryDark}>Vehículo asignado</VimaText>
      <VimaText variant="bodySmall">{assignment.value.vehicle.name} · {assignment.value.vehicle.color}</VimaText>
    </ScrollView> : null}
  </ElementEntrance>;
}

function DriverStatus({ icon, label, tone, dark }: { icon: VimaGlyphName; label: string;
  tone: 'positive' | 'warning' | 'critical' | 'location'; dark: boolean }) {
  const color = tone === 'positive' ? t.colors.greenDark : tone === 'warning' ? t.colors.amber
    : tone === 'critical' ? t.colors.red : t.colors.blue;
  return <View style={[styles.status, dark && styles.statusDark]}>
    <VimaGlyph name={icon} color={color} size={t.components.iconSizesPx[1]} />
    <VimaText variant="caption" numberOfLines={1}>{label}</VimaText>
  </View>;
}

const toneStyle = StyleSheet.create({
  neutral: { backgroundColor: t.colors.graphite }, positive: { backgroundColor: t.colors.green },
  warning: { backgroundColor: t.colors.amber }, critical: { backgroundColor: t.colors.red },
});
const styles = StyleSheet.create({
  surface: { paddingHorizontal: t.spacing.mobileHorizontalMarginPx, paddingTop: t.spacing.scalePx[3],
    paddingBottom: t.spacing.scalePx[3], gap: t.spacing.scalePx[2], backgroundColor: t.colors.white },
  surfaceDark: { backgroundColor: darkThemeColors.surface },
  critical: { gap: t.spacing.scalePx[2] },
  headingRow: { flexDirection: 'row', gap: t.spacing.scalePx[2], alignItems: 'flex-start' },
  headingCopy: { flex: 1, gap: t.spacing.scalePx[1] },
  stateMark: { width: 6, minHeight: 52, borderRadius: t.radii.pillPx },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.scalePx[1] },
  status: { minHeight: 36, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[1],
    paddingHorizontal: t.spacing.scalePx[2], borderRadius: t.radii.pillPx, backgroundColor: t.colors.background },
  statusDark: { backgroundColor: darkThemeColors.elevated },
  pickup: { flexDirection: 'row', gap: t.spacing.scalePx[2], padding: t.spacing.scalePx[2], borderRadius: t.radii.cardPx,
    backgroundColor: t.colors.background, ...elevationStyle('level1', t.colors.carbon) },
  cardDark: { backgroundColor: darkThemeColors.elevated }, pickupCopy: { flex: 1, gap: t.spacing.scalePx[0] },
  error: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[1], padding: t.spacing.scalePx[2],
    borderRadius: t.radii.fieldPx, backgroundColor: 'rgba(255, 56, 48, 0.06)' },
  errorDark: { backgroundColor: 'rgba(255, 56, 48, 0.12)' }, errorCopy: { flex: 1 },
  secondary: { maxHeight: 72 }, secondaryContent: { paddingTop: t.spacing.scalePx[1], gap: t.spacing.scalePx[0] },
  secondaryDark: { color: darkThemeColors.textSecondary },
});
