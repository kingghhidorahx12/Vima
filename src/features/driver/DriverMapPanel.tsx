import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { VimaText } from '../../design/primitives';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { useVimaTheme } from '../../design/themes';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { motionTimings } from '../../motion/timing';
import { DriverStatePanel } from './DriverStatePanel';
import { driverPresentation, driverGpsLabel, driverConnectionLabel } from './driverPresentation';

/** Primary operations stay fixed; route context and secondary actions can expand/scroll. */
export function DriverMapPanel(props: ComponentProps<typeof DriverStatePanel> & {
  lifecycleSecondary?: ReactNode; onAccount?: () => void; onMinimumHeight: (height: number) => void;
  restricted?: boolean;
}) {
  const theme = useVimaTheme(); const presentation = driverPresentation(props.state);
  const assignment = props.state?.assignment;
  const [headingHeight, setHeadingHeight] = useState(0);
  const [actionHeight, setActionHeight] = useState(0);
  const { onMinimumHeight } = props;
  const operational = presentation.variant === 'operational' && !!assignment;
  useEffect(() => {
    if (operational && headingHeight && actionHeight) onMinimumHeight(headingHeight + actionHeight + 40);
  }, [operational, headingHeight, actionHeight, onMinimumHeight]);
  if (!operational) return <View testID="driver-compact-content" onLayout={event => props.onMinimumHeight(event.nativeEvent.layout.height)}>
    <DriverStatePanel {...props} />
  </View>;
  return <ElementEntrance testID="driver-operational-panel" timing={motionTimings.state} style={[styles.panel, { backgroundColor: theme.roles.surface }]}>
    <View testID="driver-operational-summary" onLayout={event => setHeadingHeight(event.nativeEvent.layout.height)} style={styles.summary}>
      <VimaText variant="h3" numberOfLines={2}>{presentation.title}</VimaText>
      {['ASSIGNED', 'ARRIVED_PICKUP'].includes(assignment.state) ? <View style={[styles.pickup, { backgroundColor: theme.roles.locationWash }]}>
        <VimaGlyph name="recenter" size={20} color={theme.roles.location} />
        <VimaText variant="bodySmall" numberOfLines={2} style={{ flex: 1, color: theme.roles.textPrimary }}>
          {assignment.pickup.name} · {assignment.value.etaMinutes} min
        </VimaText>
      </View> : null}
    </View>
    <ScrollView testID="driver-operational-secondary" style={styles.secondary} contentContainerStyle={styles.secondaryContent} keyboardShouldPersistTaps="handled">
      <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>{presentation.copy}</VimaText>
      <VimaText variant="caption">{driverGpsLabel(props.state, props.error).label} · {driverConnectionLabel(props.connection).label}</VimaText>
      {['ASSIGNED', 'ARRIVED_PICKUP'].includes(assignment.state) ? <>
        <VimaText variant="bodyMedium">Recogida</VimaText>
        <VimaText variant="bodySmall">{assignment.pickup.address}</VimaText>
      </> : null}
      <VimaText variant="bodySmall">{assignment.value.vehicle.name} · {assignment.value.vehicle.color}</VimaText>
      {props.lifecycleSecondary}
      {!props.restricted && presentation.actionLabel && ['ASSIGNED', 'ARRIVED_PICKUP'].includes(assignment.state) ? <VimaButton secondary danger
        label={presentation.actionLabel} disabled={props.busy || props.retryAvailable || !props.configured}
        onPress={() => props.onCancelAssignment(assignment.requestId)} /> : null}
    </ScrollView>
    <View testID="driver-critical-region" onLayout={event => setActionHeight(event.nativeEvent.layout.height)} style={styles.actions}>
      {props.error ? <View accessibilityRole="alert" style={[styles.error, { backgroundColor: theme.roles.dangerWash }]}>
        <VimaText variant="bodySmall" numberOfLines={2}>{props.error}</VimaText>
      </View> : null}
      {props.lifecycleControls}
      {props.retryAvailable ? <VimaButton secondary label="Reintentar acción" disabled={props.busy} onPress={props.onRetry} /> : null}
    </View>
  </ElementEntrance>;
}
const styles = StyleSheet.create({
  pickup: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12 },
  panel: { flex: 1, minHeight: 0, paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  summary: { flexShrink: 0, gap: 4 },
  secondary: { flex: 1, minHeight: 0 }, secondaryContent: { gap: 8, paddingVertical: 4 },
  actions: { flexShrink: 0, gap: 8 }, error: { padding: 8, borderRadius: 12 },
});
