import { Text, View, type TextProps, type ViewProps } from 'react-native';
import { useVimaTheme } from '../themes';
import type { VimaSurfaceVariant, VimaTextVariant } from '../themes/light';
import { semanticColors } from '../tokens';

export function VimaSurface({ variant, style, ...props }: ViewProps & { variant: VimaSurfaceVariant }) {
  const theme = useVimaTheme();
  const approved = theme.surfaces[variant];
  if (!approved) throw new Error(`Missing approved surface: ${variant}`);
  return <View {...props} style={[approved, style]} />;
}

export function VimaText({ variant, style, ...props }: TextProps & { variant: VimaTextVariant }) {
  const theme = useVimaTheme();
  const approved = theme.text[variant];
  if (!approved) throw new Error(`Missing approved text: ${variant}`);
  return <Text {...props} style={[{ color: semanticColors.textPrimary }, approved, style]} />;
}
