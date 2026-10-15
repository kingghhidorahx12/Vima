import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VimaText } from '../../design/primitives';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { VimaThemeToggle } from '../../design/components/VimaThemeToggle';
import { VimaButton } from '../../design/components/VimaButton';
import { useVimaTheme } from '../../design/themes';
import { elevationStyle } from '../../design/themes/light';
import { visualTokens as t } from '../../design/tokens';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { motionTimings } from '../../motion/timing';
import { usePressFeedback } from '../../motion/usePressFeedback';
import Animated from 'react-native-reanimated';

export function AccessFrame({ children, onBack, title }: PropsWithChildren<{ onBack?: () => void; title?: string }>) {
  const theme = useVimaTheme(); const press = usePressFeedback();
  return <SafeAreaView testID="product-access-frame" style={[styles.fill, { backgroundColor: theme.roles.background }]}>
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scroll}>
        <View style={styles.top}>
          {onBack ? <Animated.View style={press.style}><Pressable accessibilityRole="button" accessibilityLabel="Volver"
            onPress={onBack} onPressIn={press.onPressIn} onPressOut={press.onPressOut} style={styles.back}>
            <VimaGlyph name="back" color={theme.roles.control} /></Pressable></Animated.View> : <View style={styles.back} />}
          <VimaThemeToggle touchSize={44} />
        </View>
        {title ? <VimaText variant="h2">{title}</VimaText> : <View style={styles.brand}>
          <Image source={require('../../../assets/brand/vima_header_lockup_final.png')} resizeMode="contain" style={styles.logo} accessibilityLabel="Vima" />
        </View>}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

/** Local translucent wash only; no global Glass or native blur dependency. */
export function AccessCard({ children }: PropsWithChildren) {
  const theme = useVimaTheme(); const hex = theme.roles.surface.replace('#', '');
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  return <View style={[styles.card, { backgroundColor: `rgba(${channels.join(',')},0.94)`, borderColor: theme.roles.border,
    ...elevationStyle('level1', theme.roles.shadow) }]}>{children}</View>;
}
export function AccessNotice({ children }: PropsWithChildren) {
  const theme = useVimaTheme();
  return <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.roles.dangerWash }]}>
    <VimaGlyph name="warning" color={theme.roles.danger} />
    <VimaText variant="bodySmall" style={styles.fill}>{children}</VimaText>
  </View>;
}
export function AccessAction({ children, label, onPress, disabled = false, style }: PropsWithChildren<{
  label: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>;
}>) {
  const feedback = usePressFeedback();
  return <Animated.View style={feedback.style}><Pressable accessibilityRole="button" accessibilityLabel={label}
    disabled={disabled} accessibilityState={{ disabled }} onPress={onPress}
    onPressIn={disabled ? undefined : feedback.onPressIn} onPressOut={disabled ? undefined : feedback.onPressOut}
    style={[styles.action, style]}>{children}</Pressable></Animated.View>;
}
export function RestorationSurface({ stage = 'account', error = '', onRetry, onBack, closing = false }: {
  stage?: 'account' | 'identity' | 'trip'; error?: string; onRetry?: () => void; onBack?: () => void;
  closing?: boolean;
}) {
  const theme = useVimaTheme();
  return <AccessFrame onBack={onBack}>
    <ElementEntrance timing={motionTimings.state} style={styles.restoring}>
      <View style={[styles.restorationIcon, { backgroundColor: theme.roles.positiveWash }]}>
        <Image source={require('../../../assets/driver/vehicle-approved.png')} resizeMode="contain" style={styles.car} accessible={false} />
      </View>
      <VimaText variant="h2">{closing ? 'Cerrando tu sesión' : 'Restaurando tu sesión'}</VimaText>
      <VimaText variant="bodyRegular" style={{ color: theme.roles.textSecondary, textAlign: 'center' }}>
        {closing ? 'Estamos cerrando el acceso en este dispositivo.' : 'Recuperamos tu cuenta y comprobamos si tienes un viaje para continuar.'}
      </VimaText>
      {!closing ? <AccessCard>
        <RestoreStep label="Verificando tu cuenta" complete={stage !== 'account'} active={stage === 'account' && !error} />
        <RestoreStep label="Recuperando tu viaje" complete={false} active={stage === 'trip' && !error} />
        <RestoreStep label="Preferencias listas" complete active={false} />
      </AccessCard> : null}
      {error ? <AccessNotice>{error}</AccessNotice> : <ActivityIndicator color={theme.roles.positiveStrong} />}
      {error && onRetry ? <VimaButton label="Reintentar" onPress={onRetry} /> : null}
    </ElementEntrance>
  </AccessFrame>;
}
function RestoreStep({ label, complete, active }: { label: string; complete: boolean; active: boolean }) {
  const theme = useVimaTheme();
  return <View style={styles.step} accessibilityLiveRegion="polite">
    {complete ? <VimaGlyph name="check" color={theme.roles.positiveStrong} />
      : active ? <ActivityIndicator color={theme.roles.positiveStrong} /> : <VimaGlyph name="clock" color={theme.roles.controlMuted} />}
    <VimaText variant="bodySmall">{label}</VimaText>
  </View>;
}
const styles = StyleSheet.create({
  action: { minHeight: 44 },
  fill: { flex: 1 }, scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 20,
    maxWidth: 480, width: '100%', alignSelf: 'center' }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brand: { alignSelf: 'center', padding: 8, borderRadius: t.radii.cardPx },
  logo: { width: 140, height: 44 }, card: { padding: 16, borderWidth: 1, borderRadius: t.radii.cardPx, gap: 16 },
  notice: { padding: 12, borderRadius: t.radii.fieldPx, flexDirection: 'row', gap: 8, alignItems: 'center' },
  restoring: { flex: 1, justifyContent: 'center', gap: 20 },
  restorationIcon: { width: 112, height: 112, borderRadius: 56, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  car: { width: 30, height: 50 }, step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
