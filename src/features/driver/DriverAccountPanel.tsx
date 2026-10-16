import { useCallback } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { VimaText } from '../../design/primitives';
import { VimaButton } from '../../design/components/VimaButton';
import { VimaGlyph } from '../../design/components/VimaGlyph';
import { useVimaTheme, useVimaThemeControl } from '../../design/themes';
import { passengerSurfaces } from '../../design/presentation';
import { useMotionPolicy } from '../../motion/ReducedMotion';
import { ElementEntrance } from '../../motion/ElementEntrance';
import { motionTimings } from '../../motion/timing';
import type { DriverState } from '../../services/matching/contracts';

/** Presentation of an already-authorized Driver snapshot. Never grants a role or edits its profile. */
export function DriverAccountPanel({ state, onClose, onLeave, onSession }: { state: DriverState; onClose: () => void; onLeave?: () => void; onSession?: () => void }) {
  const theme = useVimaTheme(); const control = useVimaThemeControl(); const policy = useMotionPolicy();
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose]));
  const profile = state.profile; const initials = profile.driver.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const card = { backgroundColor: theme.roles.elevatedSurface, borderColor: theme.roles.border };
  return <ElementEntrance testID="driver-account-panel" timing={motionTimings.state}
    style={[styles.page, { backgroundColor: theme.roles.background }]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <VimaText variant="h2">Mi cuenta de conductor</VimaText>
      <View style={[styles.card, card]}>
        <View style={styles.identity}><View style={[styles.avatar, { backgroundColor: theme.roles.positiveWash }]}>
          <VimaText variant="h3" style={{ color: theme.roles.positiveStrong }}>{initials}</VimaText></View>
          <View style={styles.fill}><VimaText variant="bodyMedium">{profile.driver.name}</VimaText>
            <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>{profile.driver.rating == null ? 'Nuevo conductor · Sin valoraciones' : `Calificación ${profile.driver.rating}`}</VimaText></View></View>
        <VimaText variant="caption" style={{ color: theme.roles.textSecondary }}>Datos de tu perfil autorizado. La edición no está disponible.</VimaText>
      </View>
      <View style={[styles.card, card]}><View style={styles.identity}><VimaGlyph name="car" color={theme.roles.control} />
        <VimaText variant="bodyMedium">Mi vehículo</VimaText></View>
        <VimaText variant="bodySmall">{profile.vehicle.name} · {profile.vehicle.color}</VimaText>
        <VimaText variant="bodyMedium" selectable>{profile.vehicle.plate}</VimaText></View>
      <View style={[styles.card, card]}><VimaText variant="bodyMedium">Ajustes</VimaText>
        <VimaButton secondary icon={control.name === 'dark' ? 'sun' : 'moon'} label={control.name === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'} onPress={control.toggleTheme} />
        <VimaText variant="bodySmall" style={{ color: theme.roles.textSecondary }}>
          {policy.reducedMotion ? 'Animaciones reducidas activas' : 'Movimiento según los ajustes del dispositivo'}
        </VimaText></View>
    </ScrollView>
    {onLeave ? <VimaButton secondary label="Cambiar a Passenger" onPress={onLeave} /> : null}
    {onSession ? <VimaButton secondary label="Cuenta y sesión" onPress={onSession} /> : null}
    <VimaButton secondary label="Volver a la operación" onPress={onClose} />
  </ElementEntrance>;
}
const styles = StyleSheet.create({ page: { flex: 1, padding: 16, gap: 12 }, content: { gap: 16, paddingVertical: 8 },
  fill: { flex: 1 }, card: { ...passengerSurfaces.card, padding: 16, gap: 12 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
