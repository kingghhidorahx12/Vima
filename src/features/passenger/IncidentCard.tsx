import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import type { IncidentDetails } from '../../map/incidentDetails';

export function IncidentCard({ details, onClose, maxHeight }: {
  details: IncidentDetails; onClose: () => void; maxHeight: number;
}) {
  return <View style={[styles.card, { maxHeight }]}>
    <View style={styles.row}>
      <VimaText variant="bodyMedium" style={styles.title}>{details.category ?? 'Incidente'}</VimaText>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalle del incidente" onPress={onClose} style={styles.close}>
        <VimaText variant="bodyMedium">×</VimaText>
      </Pressable>
    </View>
    <ScrollView>
      {details.description ? <VimaText variant="bodySmall">{details.description}</VimaText> : null}
      {details.severity ? <VimaText variant="caption">{details.severity}</VimaText> : null}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  card: { position: 'absolute', top: t.spacing.scalePx[2], left: t.spacing.mobileHorizontalMarginPx,
    right: t.spacing.mobileHorizontalMarginPx, padding: t.spacing.scalePx[2], borderRadius: t.radii.cardPx,
    backgroundColor: t.colors.white, elevation: 3 },
  row: { flexDirection: 'row', alignItems: 'center' }, title: { flex: 1 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
