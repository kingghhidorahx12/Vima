import { Pressable, StyleSheet, View } from 'react-native';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import { semanticHaptics } from '../../motion/haptics';
import type { TrafficLayerPreferences } from '../../map/traffic';

export function MapControls({ available, canRecenter, layers, open, onRecenter, onOpen, onToggle }: {
  available: boolean; canRecenter: boolean; layers: TrafficLayerPreferences; open: boolean;
  onRecenter: () => void; onOpen: () => void; onToggle: (layer: keyof TrafficLayerPreferences) => void;
}) {
  const tap = (action: () => void) => { void semanticHaptics('toggle'); action(); };
  return <View style={styles.stack}>
    {open ? <View style={styles.menu}>
      {!available ? <VimaText variant="caption" style={styles.unavailable}>Capas no disponibles</VimaText> : null}
      {(['traffic', 'incidents'] as const).map((layer) => <Pressable key={layer} accessibilityRole="switch"
        accessibilityLabel={layer === 'traffic' ? 'Tráfico' : 'Incidentes'}
        accessibilityState={{ checked: available && layers[layer], disabled: !available }} disabled={!available}
        onPress={() => tap(() => onToggle(layer))} style={styles.menuRow}>
        <VimaText variant="bodySmall" style={styles.menuLabel}>{layer === 'traffic' ? 'Tráfico' : 'Incidentes'}</VimaText>
        <View style={[styles.switch, layers[layer] && available && styles.switchOn]}>
          <View style={[styles.knob, layers[layer] && available && styles.knobOn]} />
        </View>
      </Pressable>)}
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Centrar ubicación" accessibilityState={{ disabled: !canRecenter }}
      disabled={!canRecenter} onPress={() => tap(onRecenter)} style={styles.button}><VimaGlyph name="recenter" /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Capas del mapa" onPress={() => tap(onOpen)}
      style={styles.button}><VimaGlyph name="layers" /></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  stack: { alignItems: 'flex-end', gap: t.spacing.scalePx[1] },
  button: { width: 48, height: 48, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white,
    alignItems: 'center', justifyContent: 'center', elevation: 3 },
  menu: { minWidth: 170, padding: t.spacing.scalePx[2], borderRadius: t.radii.cardPx,
    backgroundColor: t.colors.white, elevation: 3 },
  menuRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: t.spacing.scalePx[2] },
  menuLabel: { flex: 1 }, unavailable: { color: t.colors.gray },
  switch: { width: 36, height: 22, borderRadius: t.radii.pillPx, backgroundColor: t.colors.grayLight,
    padding: 2, justifyContent: 'center' },
  switchOn: { backgroundColor: t.colors.greenDark },
  knob: { width: 18, height: 18, borderRadius: t.radii.pillPx, backgroundColor: t.colors.white },
  knobOn: { alignSelf: 'flex-end' },
});
