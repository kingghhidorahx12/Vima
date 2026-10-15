import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaText } from '../../design/primitives';
import { useVimaTheme } from '../../design/themes';
import { textStyle } from '../../design/typography';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { motionTimings } from '../../motion/timing';
import { productAuthClient, ProductAuthClientError } from '../../services/auth/productSession';
import { withDeadline } from '../../services/api/deadline';
import { AccessAction, AccessFrame, AccessNotice, RestorationSurface } from './AccessSurface';
import { accessErrorMessage, countdown, mexicanPhoneDigits, otpDigits, otpResendSeconds, validMexicanPhone } from './accessModel';

export function ProductAuthScreen() {
  const theme = useVimaTheme(); const router = useRouter();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [phone, setPhone] = useState(''); const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [challenge, setChallenge] = useState(''); const [registrationToken, setRegistrationToken] = useState('');
  const [expiresAt, setExpiresAt] = useState(0); const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now()); const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [loading, setLoading] = useState(true); const [restoreFailed, setRestoreFailed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const restore = useCallback(async () => {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError(''); setRestoreFailed(false);
    try {
      const account = await withDeadline(productAuthClient().current(controller.signal), 12_000, controller.signal, () => controller.abort());
      if (!controller.signal.aborted && account) router.replace('/passenger' as Href);
    } catch (reason) { if (pending.current === controller) { setError(accessErrorMessage(reason)); setRestoreFailed(true); } }
    finally { if (pending.current === controller) { setLoading(false); pending.current = null; } }
  }, [router]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void restore(); });
    return () => { active = false; pending.current?.abort(); pending.current = null; }; }, [restore]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => { setForeground(value === 'active'); setNow(Date.now()); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!challenge || registrationToken || !foreground) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, registrationToken, foreground]);
  const changePhone = useCallback(() => {
    pending.current?.abort(); pending.current = null; setBusy(false); setLoading(false); setRestoreFailed(false);
    setChallenge(''); setRegistrationToken(''); setCode(''); setName(''); setError('');
  }, []);
  const back = useCallback(() => { if (challenge || registrationToken || loading || restoreFailed) changePhone();
    else if (router.canGoBack()) router.back(); }, [challenge, registrationToken, loading, restoreFailed, changePhone, router]);
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!challenge && !registrationToken && !loading && !restoreFailed) return false;
      back(); return true;
    }); return () => listener.remove();
  }, [back, challenge, registrationToken, loading, restoreFailed]));
  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('');
    try { await operation(controller.signal); }
    catch (reason) { if (!controller.signal.aborted) {
      if (reason instanceof ProductAuthClientError && reason.code === 'registration_expired') { setRegistrationToken(''); setChallenge(''); }
      setError(accessErrorMessage(reason));
    } }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  };
  const remaining = countdown(expiresAt, now); const resendRemaining = countdown(resendAt, now);
  const sendCode = () => { if (!validMexicanPhone(phone) || challenge && resendRemaining) return;
    void run(async signal => {
      const value = await productAuthClient().startOtp(`+52${phone}`, signal);
      if (signal.aborted) return;
      const received = Date.now(); setNow(received); setExpiresAt(received + value.expiresIn * 1000);
      setResendAt(received + otpResendSeconds * 1000); setChallenge(value.challengeId); setRegistrationToken(''); setCode('');
    });
  };
  const verifyCode = () => { if (code.length !== 6 || !remaining) return;
    void run(async signal => {
      const result = await productAuthClient().verifyOtp(challenge, code, signal);
      if (signal.aborted) return;
      if (result.status === 'authenticated') router.replace('/passenger' as Href);
      else { setRegistrationToken(result.registrationToken); setCode(''); }
    });
  };
  const register = () => { void run(async signal => {
    await productAuthClient().register(registrationToken, name, signal);
    if (!signal.aborted) router.replace('/passenger' as Href);
  }); };
  if (loading || restoreFailed) return <RestorationSurface error={restoreFailed ? error : ''} onRetry={() => { void restore(); }} onBack={changePhone} />;
  const step = registrationToken ? 'name' : challenge ? 'otp' : 'phone';
  const title = step === 'phone' ? 'Entra a Vima' : step === 'otp' ? 'Verifica tu número' : 'Completa tu perfil';
  return <AccessFrame onBack={step !== 'phone' || router.canGoBack() ? back : undefined}>
    <ElementEntrance key={step} timing={motionTimings.state} style={styles.content}>
      {notice === 'local_logout' ? <AccessNotice>Sesión cerrada en este dispositivo. No pudimos confirmar el cierre en el servidor.</AccessNotice> : null}
      {notice === 'session_expired' ? <AccessNotice>Tu sesión venció o fue revocada. Verifica tu número para volver a entrar.</AccessNotice> : null}
      {notice === 'session_storage' ? <AccessNotice>No pudimos completar la operación de sesión. Reintenta el acceso seguro antes de continuar.</AccessNotice> : null}
      {step === 'name' ? <View accessibilityLabel="Teléfono verificado" style={[styles.progress, { backgroundColor: theme.roles.border }]}>
        <View style={[styles.progressComplete, { backgroundColor: theme.roles.positiveStrong }]} /></View> : null}
      <View style={styles.heading}><VimaText variant="h2" style={styles.center}>{title}</VimaText>
        <VimaText variant="bodyRegular" style={[styles.center, { color: theme.roles.textSecondary }]}>
          {step === 'phone' ? 'Ingresa tu número de teléfono para continuar.' : step === 'otp' ? `Te enviamos un código de 6 dígitos a +52 ${phone}.`
            : 'Cuéntanos cómo te llamas para preparar tu cuenta de pasajero.'}
        </VimaText></View>
      {step === 'phone' ? <>
        <View style={[styles.phoneField, { backgroundColor: theme.roles.elevatedSurface, borderColor: theme.roles.border }]}>
          <VimaText variant="bodyMedium">🇲🇽  +52</VimaText><View style={[styles.separator, { backgroundColor: theme.roles.border }]} />
          <TextInput accessibilityLabel="Teléfono mexicano" value={phone} onChangeText={value => setPhone(mexicanPhoneDigits(value))}
            keyboardType="phone-pad" autoComplete="tel-national" maxLength={18} editable={!busy} placeholder="55 1234 5678"
            placeholderTextColor={theme.roles.disabledText} style={[styles.phoneInput, { color: theme.roles.textPrimary }]} />
        </View>
        <VimaButton label="Continuar" onPress={sendCode} loading={busy} disabled={!validMexicanPhone(phone)} />
        <VimaText variant="bodySmall" style={[styles.center, { color: theme.roles.textSecondary }]}>Te enviaremos un código por SMS.</VimaText>
      </> : step === 'otp' ? <>
        <View testID="product-otp-field" style={styles.codeField}>
          <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.cells}>
            {Array.from({ length: 6 }, (_, index) => <View key={index} style={[styles.cell, { backgroundColor: theme.roles.subtleSurface,
              borderColor: index === Math.min(code.length, 5) ? theme.roles.positiveStrong : theme.roles.border }]}>
              <VimaText variant="h3">{code[index] ?? ''}</VimaText></View>)}
          </View>
          <TextInput accessibilityLabel="Código de verificación de seis dígitos" value={code} onChangeText={value => setCode(otpDigits(value))}
            autoFocus keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={32}
            autoCorrect={false} spellCheck={false} importantForAutofill="yes" underlineColorAndroid="transparent"
            caretHidden editable={!busy && !!remaining} style={styles.codeInput} selectionColor="transparent" onSubmitEditing={verifyCode} />
        </View>
        {!remaining ? <AccessNotice>El código venció. Solicita uno nuevo para continuar.</AccessNotice> : null}
        <VimaButton label="Verificar código" onPress={verifyCode} loading={busy} disabled={code.length !== 6 || !remaining} />
        <AccessAction label="Reenviar código" disabled={busy || resendRemaining > 0} onPress={sendCode} style={styles.textAction}>
          <VimaText variant="bodySmall" style={{ color: resendRemaining ? theme.roles.textSecondary : theme.roles.positiveStrong }}>
            {resendRemaining ? `Reenviar código en ${Math.floor(resendRemaining / 60).toString().padStart(2, '0')}:${(resendRemaining % 60).toString().padStart(2, '0')}` : 'Reenviar código'}
          </VimaText></AccessAction>
        <AccessAction label="Cambiar número" onPress={changePhone} style={styles.textAction}>
          <VimaText variant="bodySmall" style={{ color: theme.roles.positiveStrong }}>Cambiar número</VimaText></AccessAction>
      </> : <>
        <VimaText variant="bodyMedium">Nombre completo</VimaText>
        <TextInput accessibilityLabel="Nombre completo" value={name} onChangeText={setName} autoFocus autoComplete="name" autoCapitalize="words"
          maxLength={100} editable={!busy} placeholder="Tu nombre y apellido" placeholderTextColor={theme.roles.disabledText}
          style={[styles.nameInput, { color: theme.roles.textPrimary, backgroundColor: theme.roles.elevatedSurface, borderColor: theme.roles.border }]} />
        <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>Puedes usar Vima como pasajero al completar tu nombre.</VimaText>
        <VimaButton label="Continuar" onPress={register} loading={busy} disabled={name.trim().length < 2} />
      </>}
      {error ? <AccessNotice>{error}</AccessNotice> : null}
    </ElementEntrance>
  </AccessFrame>;
}
const styles = StyleSheet.create({ content: { flexGrow: 1, justifyContent: 'flex-start', gap: 16, paddingTop: 8, paddingBottom: 24 },
  heading: { gap: 8, marginBottom: 8 }, center: { textAlign: 'center' },
  phoneField: { minHeight: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  separator: { height: 24, width: 1 }, phoneInput: { ...textStyle({ variant: 'body', weight: 400 }), flex: 1, minHeight: 56, paddingVertical: 0 },
  nameInput: { ...textStyle({ variant: 'body', weight: 400 }), minHeight: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 },
  textAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  codeField: { height: 56, position: 'relative' }, cells: { flexDirection: 'row', gap: 8, height: 56 },
  cell: { flex: 1, borderWidth: 1, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  // Hide the entire native glyph/composition layer, including Android IME spans.
  // It remains the sole full-size, accessible input; the six cells only display state.
  codeInput: { ...StyleSheet.absoluteFill, opacity: 0, color: 'transparent', backgroundColor: 'transparent', fontSize: 24 },
  progress: { width: 96, height: 4, borderRadius: 2, alignSelf: 'center' }, progressComplete: { width: '50%', height: 4, borderRadius: 2 },
});
