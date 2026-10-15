import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { VimaText } from '../../design/primitives';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { useVimaTheme, useVimaThemeControl } from '../../design/themes';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { productAuthClient, ProductAuthClientError, type ProductAccount } from '../../services/auth/productSession';
import { AccessAction, AccessCard, AccessFrame, AccessNotice, RestorationSurface } from './AccessSurface';
import { accessErrorMessage } from './accessModel';
import { AboutVima } from './AboutVima';

export function ProductAccountScreen() {
  const router = useRouter(); const client = useQueryClient(); const theme = useVimaTheme();
  const control = useVimaThemeControl(); const policy = useMotionPolicy();
  const [account, setAccount] = useState<ProductAccount>(); const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0); const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false); const lock = useRef(false);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    void Promise.resolve().then(() => productAuthClient().current(controller.signal)).then(value => {
      if (!active) return;
      if (!value) router.replace('/auth' as Href); else { setAccount(value); setError(''); }
    }).catch(reason => { if (active) setError(accessErrorMessage(reason)); });
    return () => { active = false; controller.abort(); };
  }, [router, attempt]);
  const back = () => { if (router.canGoBack()) router.back(); else router.replace('/passenger' as Href); };
  const logout = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    let unconfirmed = false;
    try { await productAuthClient().logout(); } catch (reason) {
      if (reason instanceof ProductAuthClientError && reason.code === 'session_storage_unavailable') {
        setError('No pudimos cerrar la sesión en este dispositivo. Inténtalo de nuevo.');
        setBusy(false); lock.current = false; return;
      }
      unconfirmed = true;
    }
    // Logout clears only the product namespace; no trip cancellation and no QA credential mutation.
    client.clear(); router.dismissAll();
    router.replace(unconfirmed ? '/auth?notice=local_logout' as Href : '/auth' as Href);
  };
  if (!account) return <RestorationSurface error={error} onRetry={() => setAttempt(value => value + 1)} onBack={back} />;
  const initials = account.displayName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <AccessFrame title="Mi perfil" onBack={busy ? undefined : back}>
    <AccessCard>
      <View style={styles.identity}>
        <View accessibilityLabel="Avatar con tus iniciales" style={[styles.avatar, { backgroundColor: theme.roles.positiveWash }]}>
          <VimaText variant="h2" style={{ color: theme.roles.positiveStrong }}>{initials}</VimaText>
        </View>
        <View style={styles.fill}><VimaText variant="bodyMedium">{account.displayName}</VimaText>
          <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>Cuenta de pasajero</VimaText></View>
      </View>
      <VimaText variant="caption" style={{ color: theme.roles.textSecondary }}>Nombre de tu cuenta. La edición de perfil aún no está disponible.</VimaText>
    </AccessCard>
    <VimaText variant="h3">Ajustes</VimaText>
    <AccessCard>
      <AccessAction label="Cambiar apariencia" disabled={busy} onPress={control.toggleTheme} style={styles.row}>
        <VimaGlyph name={control.name === 'dark' ? 'sun' : 'moon'} color={theme.roles.control} />
        <View style={styles.fill}><VimaText variant="bodyMedium">Apariencia</VimaText>
          <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>{control.name === 'dark' ? 'Oscuro' : 'Claro'} · En toda Vima</VimaText></View>
        <VimaGlyph name="chevron" color={theme.roles.controlMuted} />
      </AccessAction>
      <View style={[styles.divider, { backgroundColor: theme.roles.border }]} />
      <View style={styles.row}><VimaGlyph name="info" color={theme.roles.control} />
        <View style={styles.fill}><VimaText variant="bodyMedium">Movimiento</VimaText>
          <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>
            {policy.reducedMotion ? 'Animaciones reducidas activas' : 'Se respetan los ajustes de tu dispositivo'}
          </VimaText></View></View>
    </AccessCard>
    <AccessCard><View style={styles.row}><VimaGlyph name="car" color={theme.roles.warning} />
      <View style={styles.fill}><VimaText variant="bodyMedium">Para conducir con Vima</VimaText>
        <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>Necesitas aprobación y un perfil vehicular completo.</VimaText>
      </View></View></AccessCard>
    {confirmLogout ? <AccessCard>
      <VimaText variant="bodyMedium">¿Cerrar sesión en este dispositivo?</VimaText>
      <VimaText variant="bodySmall">Podrás volver a entrar con un código SMS.</VimaText>
      <VimaButton danger label="Confirmar cierre de sesión" loading={busy} onPress={() => { void logout(); }} />
      <VimaButton secondary label="Conservar sesión" disabled={busy} onPress={() => setConfirmLogout(false)} />
    </AccessCard> : <VimaButton secondary danger label="Cerrar sesión" onPress={() => setConfirmLogout(true)} />}
    {error ? <AccessNotice>{error}</AccessNotice> : null}
    <AboutVima />
  </AccessFrame>;
}
const styles = StyleSheet.create({ fill: { flex: 1 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }, divider: { height: 1 },
});
