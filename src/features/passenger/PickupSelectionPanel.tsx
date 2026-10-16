import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { useVimaTheme } from '../../design/themes';
import { visualTokens as t } from '../../design/tokens';
import { textStyle } from '../../design/typography';
import { withinPickupArea } from '../../services/geospatial/pickup';
import type { PickupSelection } from './usePassengerFlow';

export function PickupSelectionPanel({ selection, limit, online, onConfirm, onCancel, onReference, onRetry }: {
  limit: number;
  selection: PickupSelection; online: boolean; onConfirm: () => void; onCancel: () => void;
  onReference: (text: string) => void; onRetry: () => void;
}) {
  const theme = useVimaTheme();
  const outside = !!selection.reference && !!selection.coordinate && !withinPickupArea(selection.reference.coordinate, selection.coordinate, limit);
  const busy = selection.moving || selection.loading;
  const canConfirm = !!selection.coordinate && !busy && !outside && online &&
    !!(selection.place?.address.trim() || selection.manualReference.trim());
  return <View testID="passenger-pickup-panel" style={styles.panel}>
    <View style={[styles.notice, { backgroundColor: outside ? theme.roles.dangerWash : theme.roles.positiveWash }]}>
      <VimaGlyph name={outside ? 'warning' : 'info'} color={outside ? theme.roles.danger : theme.roles.positiveStrong} size={20} />
      <VimaText variant="bodySmall" accessibilityLiveRegion="polite" style={styles.fill}>
        {outside ? `Fuera del área de recogida (${limit} m)` : selection.reference
          ? `Ajusta la recogida dentro de ${limit} m del origen` : 'Mueve el mapa para elegir tu origen'}</VimaText>
    </View>
    <VimaText variant="bodyMedium">Punto de recogida</VimaText>
    {selection.coordinateError ? <><VimaText variant="bodySmall">No pudimos leer el punto del mapa. Reintenta o mueve el mapa.</VimaText>
      <VimaButton secondary compact label="Reintentar punto" onPress={onRetry} /></> : busy ? <View style={styles.notice}><ActivityIndicator color={theme.roles.positiveStrong} />
      <VimaText variant="bodySmall">{selection.moving ? 'Suelta el mapa para elegir el punto' : 'Buscando la dirección...'}</VimaText></View>
      : <><VimaText variant="bodyMedium">{selection.place?.name || 'Elige un punto'}</VimaText>
        {!!selection.place?.address && <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>{selection.place.address}</VimaText>}</>}
    {selection.reverseFailed && !busy ? <>
      <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>No pudimos identificar una calle. Puedes añadir una referencia; no confirma acceso vehicular.</VimaText>
      <VimaButton secondary compact label="Reintentar dirección" onPress={onRetry} disabled={!online} />
    </> : null}
    <TextInput accessibilityLabel="Referencia de recogida" placeholder="Entrada principal, portón o referencia"
      onTouchStart={event => event.stopPropagation()}
      placeholderTextColor={theme.roles.textSecondary} maxLength={240} value={selection.manualReference} onChangeText={onReference}
      style={[styles.input, { color: theme.roles.textPrimary, backgroundColor: theme.roles.subtleSurface, borderColor: theme.roles.border }]} />
    <VimaButton label="Confirmar recogida" disabled={!canConfirm} onPress={onConfirm} />
    <VimaButton secondary compact label="Cancelar ajuste" onPress={onCancel} />
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: t.spacing.scalePx[1] }, fill: { flex: 1 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: t.radii.smallPx },
  input: { ...textStyle({ variant: 'body', weight: 400 }), minHeight: 44, borderWidth: 1, borderRadius: t.radii.smallPx, paddingHorizontal: 12 },
});
