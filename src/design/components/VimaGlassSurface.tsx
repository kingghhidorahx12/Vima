import { createContext, useContext, type PropsWithChildren, type RefObject } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useVimaTheme } from '../themes';
import { elevationStyle } from '../themes/light';

type BlurTarget = RefObject<View | null>;
const VimaGlassTargetContext = createContext<BlurTarget | null>(null);

export function VimaGlassTargetProvider({ target, children }: PropsWithChildren<{ target: BlurTarget }>) {
  return <VimaGlassTargetContext.Provider value={target}>{children}</VimaGlassTargetContext.Provider>;
}

/** Presentation-only glass layer. The caller remains the geometry, interaction and accessibility owner. */
export function VimaGlassSurface({ style, pressed = false, disabled = false, level, children,
  testID = 'vima-glass-surface' }: PropsWithChildren<{
  style?: StyleProp<ViewStyle>; pressed?: boolean; disabled?: boolean; level?: 'level1' | 'level2'; testID?: string;
}>) {
  const theme = useVimaTheme();
  const blurTarget = useContext(VimaGlassTargetContext);
  const nativeBlurAvailable = Platform.OS !== 'android' || blurTarget !== null;
  const base = disabled ? theme.glass.disabled : pressed ? theme.glass.pressed : theme.glass.base;
  return <View testID={testID} pointerEvents={children ? 'box-none' : 'none'}
    style={[style, level ? elevationStyle(level, theme.glass.shadow) : undefined]}>
    <View style={[StyleSheet.absoluteFill, style, styles.clip]}>
      {nativeBlurAvailable ? <BlurView testID="vima-glass-blur" blurTarget={blurTarget ?? undefined}
        blurMethod="dimezisBlurViewSdk31Plus" tint={theme.glass.tint} intensity={theme.glass.intensity}
        style={StyleSheet.absoluteFill} /> : null}
      <View testID="vima-glass-tint" style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />
      <View testID="vima-glass-border" style={[StyleSheet.absoluteFill, styles.border,
        { borderColor: theme.glass.border }]} />
      <View testID="vima-glass-highlight" style={[styles.highlight,
        { backgroundColor: theme.glass.highlight }]} />
    </View>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  border: { borderWidth: 1 },
  highlight: { position: 'absolute', top: 1, left: 8, right: 8, height: 1 },
});
