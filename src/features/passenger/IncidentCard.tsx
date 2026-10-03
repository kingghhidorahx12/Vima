import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import type { IncidentDetails } from '../../map/incidentDetails';
import { VimaGlyph } from '../../design/components/VimaGlyph';

export function IncidentCard({ details, onClose, maxHeight }: {
  details: IncidentDetails; onClose: () => void; maxHeight: number;
}) {
  return <View style={[styles.card, { maxHeight }]}>
    <View style={styles.row}>
      {details.icon ? <View style={styles.icon}><VimaGlyph name={details.icon} color={t.colors.amber} /></View> : null}
      <VimaText variant="bodyMedium" style={styles.title}>{details.category || 'Incidente vial'}</VimaText>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalle del incidente" onPress={onClose} style={styles.close}>
        <VimaText variant="bodyMedium">×</VimaText>
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.detail}>
      {details.description ? <VimaText variant="bodySmall">{details.description}</VimaText> : null}
      {details.severity ? <VimaText variant="caption" style={styles.secondary}>{details.severity}</VimaText> : null}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  card: { position: 'absolute', top: t.spacing.scalePx[2], left: t.spacing.mobileHorizontalMarginPx,
    right: t.spacing.mobileHorizontalMarginPx, paddingHorizontal: t.spacing.scalePx[3], paddingVertical: t.spacing.scalePx[2],
    borderRadius: t.radii.cardPx, backgroundColor: t.colors.white, borderWidth: t.borders.standardWidthPx,
    borderColor: t.colors.grayLight, elevation: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[1] },
  icon: { width: t.spacing.scalePx[7], height: t.spacing.scalePx[7], alignItems: 'center', justifyContent: 'center',
    borderRadius: t.radii.smallPx, backgroundColor: t.colors.background },
  detail: { gap: t.spacing.scalePx[1] }, secondary: { color: t.colors.graphite }, title: { flex: 1 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
