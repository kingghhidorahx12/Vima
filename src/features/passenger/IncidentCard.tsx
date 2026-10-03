import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import type { IncidentDetails } from '../../map/incidentDetails';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { passengerSurfaces as surfaces, surfaceColors } from '../../design/presentation';

export function IncidentCard({ details, onClose, maxHeight }: {
  details: IncidentDetails; onClose: () => void; maxHeight: number;
}) {
  return <View style={[styles.card, { maxHeight }]}>
    <View style={styles.row}>
      {details.icon ? <View style={styles.icon}><VimaGlyph name={details.icon} color={t.colors.amber} /></View> : null}
      <VimaText variant="bodyMedium" style={styles.title}>{details.category || 'Incidente vial'}</VimaText>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalle del incidente" onPress={onClose}
        style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
        <VimaGlyph name="close" color={t.colors.graphite} />
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={[styles.detail, !!(details.description || details.severity) && styles.detailSeparated]}>
      {details.description ? <VimaText variant="bodySmall">{details.description}</VimaText> : null}
      {details.severity ? <VimaText variant="caption" style={styles.secondary}>{details.severity}</VimaText> : null}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  card: { ...surfaces.floating, position: 'absolute', top: t.spacing.scalePx[2], left: t.spacing.mobileHorizontalMarginPx,
    right: t.spacing.mobileHorizontalMarginPx, paddingHorizontal: t.spacing.scalePx[3], paddingVertical: t.spacing.scalePx[2],
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[1] },
  icon: { width: t.spacing.scalePx[7], height: t.spacing.scalePx[7], alignItems: 'center', justifyContent: 'center',
    borderRadius: t.radii.fieldPx, backgroundColor: surfaceColors.warningWash },
  detail: { gap: t.spacing.scalePx[1] },
  detailSeparated: { marginTop: t.spacing.scalePx[1], paddingTop: t.spacing.scalePx[2],
    borderTopWidth: t.borders.standardWidthPx, borderTopColor: surfaceColors.border },
  secondary: { color: t.colors.graphite, backgroundColor: t.colors.accentBlueSoft, borderRadius: t.radii.smallPx,
    paddingHorizontal: t.spacing.scalePx[1], paddingVertical: t.spacing.scalePx[0], alignSelf: 'flex-start' },
  title: { flex: 1 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: t.radii.pillPx },
  closePressed: { backgroundColor: t.colors.accentBlueSoft },
});
