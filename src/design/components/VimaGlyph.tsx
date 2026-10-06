import { StyleSheet, Text } from 'react-native';
import { visualTokens as t } from '../tokens';
import { glyphCodepoints, glyphFamily } from '../glyphs';

export type VimaGlyphName = keyof typeof glyphCodepoints;
/** Decorative glyph; its containing control owns the accessible label and hit target. */
export function VimaGlyph({ name, color = t.colors.carbon, size = t.components.iconSizesPx[2] }: {
  name: VimaGlyphName; color?: string; size?: number;
}) {
  return <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    allowFontScaling={false} style={[styles.icon, { color, fontSize: size, lineHeight: size, width: size, height: size }]}>
    {String.fromCodePoint(glyphCodepoints[name])}</Text>;
}
const size = t.components.iconSizesPx[2];
const styles = StyleSheet.create({
  icon: { fontFamily: glyphFamily, fontSize: size, lineHeight: size, width: size, height: size,
    includeFontPadding: false, textAlign: 'center' },
});
