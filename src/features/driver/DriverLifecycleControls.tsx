import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaText } from '../../design/primitives';
import { useVimaTheme } from '../../design/themes';
import { visualTokens as t } from '../../design/tokens';
import type { DriverState } from '../../services/matching/contracts';
import type { LifecycleCommand, PostPinCommand } from '../../services/matching/lifecycle';

export function DriverLifecycleControls({ assignment, busy, queued, pendingCommands = [], onCommand, onSync }: {
  assignment: NonNullable<DriverState['assignment']>; busy: boolean; queued: number;
  pendingCommands?: readonly PostPinCommand[];
  onCommand: (command: LifecycleCommand) => void; onSync: () => void;
}) {
  const theme = useVimaTheme(); const [pin, setPin] = useState(''); const { state, lifecycle: life } = assignment;
  const pendingStops = pendingCommands.filter(c => c.name === 'complete_stop' && c.stopIndex >= life.completedStops);
  const nextStop = life.completedStops + pendingStops.length;
  const finishing = pendingCommands.some(c => c.name === 'finish');
  return <View testID="driver-lifecycle-controls" style={{ gap: t.spacing.scalePx[1] }}>
    {state === 'ASSIGNED' ? <VimaButton label="Llegué" disabled={busy} onPress={() => onCommand({ name: 'arrive' })} /> : null}
    {state === 'ARRIVED_PICKUP' ? <>
      <TextInput accessibilityLabel="PIN del pasajero" value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={4}
        secureTextEntry style={{ color: theme.roles.textPrimary, backgroundColor: theme.roles.subtleSurface, minHeight: 48,
          borderRadius: t.radii.fieldPx, paddingHorizontal: t.spacing.mobileHorizontalMarginPx }} />
      <VimaButton label="Iniciar viaje" disabled={busy || pin.length !== 4} onPress={() => { onCommand({ name: 'start', pin }); setPin(''); }} />
      <VimaButton secondary label="Pasajero no se presentó" disabled={busy} onPress={() => onCommand({ name: 'no_show' })} />
      <VimaText variant="caption">Disponible a los 5 minutos de confirmar la llegada.</VimaText>
    </> : null}
    {state === 'IN_PROGRESS' ? <>
      <VimaText variant="bodySmall">Viaje en curso · {life.meter?.distanceMeters ?? 0} m confirmados</VimaText>
      {pendingStops.length ? <VimaText variant="caption">{pendingStops.length} paradas pendientes de confirmar.</VimaText> : null}
      {assignment.stops[nextStop] ? <VimaButton secondary label={`Completar parada: ${assignment.stops[nextStop]!.name}`}
        disabled={busy || finishing} onPress={() => onCommand({ name: 'complete_stop', stopIndex: nextStop })} /> : null}
      {assignment.additionCodes.filter(code => !life.incurredAdditionCodes.includes(code)).map(code => <VimaButton key={code} secondary
        label={`Registrar extra: ${code}`} disabled={busy || finishing || pendingCommands.some(c => c.name === 'incur_addition' && c.code === code)} onPress={() => onCommand({ name: 'incur_addition', code })} />)}
      <VimaButton label="Finalizar viaje" disabled={busy || finishing || nextStop !== assignment.stops.length}
        onPress={() => onCommand({ name: 'finish', kind: 'normal', finalTelemetrySequence: life.meter?.lastSequence ?? 0 })} />
      <VimaButton secondary label="Finalizar anticipadamente" disabled={busy || finishing}
        onPress={() => onCommand({ name: 'finish', kind: 'early', finalTelemetrySequence: life.meter?.lastSequence ?? 0 })} />
    </> : null}
    {state === 'PAYMENT_PENDING' ? <>
      <VimaText variant="bodyMedium">Efectivo: ${((life.settlement?.price.totalMinor ?? 0) / 100).toFixed(2)} MXN</VimaText>
      <VimaButton label="Efectivo recibido" disabled={busy || queued > 0} onPress={() => onCommand({ name: 'cash_received' })} />
      <VimaButton secondary label="Problema con el pago" disabled={busy || queued > 0} onPress={() => onCommand({ name: 'cash_problem' })} />
    </> : null}
    {queued > 0 ? <VimaText variant="caption">{queued} operaciones pendientes de confirmar.</VimaText> : null}
    <VimaButton secondary label="Sincronizar viaje" disabled={busy} onPress={onSync} />
  </View>;
}
