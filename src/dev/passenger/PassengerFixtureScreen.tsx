import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { registerDevMenuItems } from 'expo-dev-client';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { VimaText } from '../../design/primitives';
import { visualTokens as t } from '../../design/tokens';
import { PassengerScreen } from '../../features/passenger/PassengerScreen';
import type { PassengerMapConfig } from '../../features/passenger/PassengerMap';
import { createVehicleMotion } from '../../map/vehicleMotion';
import { normalizeCoordinate } from '../../map/models';
import { createPassengerFixtureGateway, type FixtureOutcome } from './gateway';
import { locateCurrentPlace } from '../../services/location/currentPlace';

/** All temporary map measurements stay in this dev adapter, never become approved tokens. */
const fixtureMap: PassengerMapConfig = {
  route: { width: t.spacing.scalePx[0]!, opacity: 1, cap: 'round', join: 'round' },
  point: { radius: t.components.iconSizesPx[0]! / 2, strokeWidth: t.borders.standardWidthPx, strokeColor: t.colors.white },
  vehicle: { radius: t.components.iconSizesPx[1]! / 2, color: t.colors.carbon,
    strokeWidth: t.borders.standardWidthPx, strokeColor: t.colors.white },
  viewport: (quote, assignment, origin) => {
    const geometry = (assignment?.routeToOrigin ?? quote?.route)?.geometry;
    const points = geometry ? (geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat()) : [];
    const padding = { top: t.spacing.scalePx[5]!, left: t.spacing.mobileHorizontalMarginPx,
      right: t.spacing.mobileHorizontalMarginPx, bottom: 0 };
    return points.length >= 2 ? { coordinates: points.map(normalizeCoordinate), padding }
      : { center: origin?.coordinate ?? [-99.1645, 19.4262], zoom: 14, padding };
  },
  // Only a single assigned sample exists in this fixture. This is not a production jump policy.
  vehicleMotion: createVehicleMotion(() => { 'worklet'; return false; }),
};

export default function PassengerFixtureScreen() {
  if (!__DEV__) throw new Error('Passenger fixtures are development-only');
  const [fixture] = useState(() => createPassengerFixtureGateway(undefined, { locate: locateCurrentPlace }));
  const [expanded, setExpanded] = useState(false);
  const [outcome, setOutcome] = useState<FixtureOutcome>('prolonged');
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  useEffect(() => () => { fixture.controls.dispose(); client.removeQueries({ queryKey: ['passenger', fixture.gateway.scope] }); }, [client, fixture]);
  useFocusEffect(useCallback(() => {
    let mounted = true;
    let registering = false;
    let frame: number | undefined;
    const register = () => {
      if (!mounted || registering || AppState.currentState !== 'active') return;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!mounted || AppState.currentState !== 'active') return;
        registering = true;
        void registerDevMenuItems([{ name: 'Vima · controles de prueba', shouldCollapse: true,
          callback: () => { if (mounted && AppState.currentState === 'active') setExpanded(true); } }])
          .catch((error: unknown) => console.warn('Vima DevMenu: registro pendiente hasta volver a primer plano.', error))
          .finally(() => { registering = false; });
      });
    };
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') register(); });
    register();
    return () => {
      mounted = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
      subscription.remove();
      // The JS callback is now inert. Do not call a native Activity API during teardown.
    };
  }, []));
  const chooseOutcome = (value: FixtureOutcome) => { setOutcome(value); fixture.controls.setOutcome(value); };
  const invalidateFixtures = () => { void client.invalidateQueries({ queryKey: ['passenger', fixture.gateway.scope] }); };
  const explain = (value: string) => { setNotice(value); setExpanded(true); };
  return <View style={styles.fill}>
    <PassengerScreen gateway={fixture.gateway} mapConfig={fixtureMap} boundaries={{
      schedule: () => explain('Fixture · Programar: límite de integración; no se creó un viaje programado.'),
      call: () => explain('Fixture · Llamar: sin número real; no se inició ninguna llamada.'),
      safety: () => explain('Fixture · Seguridad: límite de integración; no se envió ninguna alerta.'),
    }} />
    {expanded ? <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar controles de prueba" onPress={() => setExpanded(false)} style={styles.scrim} />
      <ScrollView style={styles.tools} contentContainerStyle={styles.toolContent}>
      <Pressable accessibilityRole="button" onPress={() => setExpanded(false)}><VimaText variant="bodyMedium">Cerrar controles de prueba</VimaText></Pressable>
      {notice ? <Pressable onPress={() => setNotice('')}><VimaText variant="caption">{notice}</VimaText></Pressable> : null}
      <VimaText variant="caption">Controles de prueba · siguiente resultado: {outcome} · trazado, puntos y viewport de mapa provisionales</VimaText>
      <View style={styles.actions}>
        <Tool label="Escenario: prolongada" action={() => chooseOutcome('prolonged')} />
        <Tool label="Escenario: asignación" action={() => chooseOutcome('assigned')} />
        <Tool label="Forzar expansión" action={() => fixture.controls.advance('expanding')} />
        <Tool label="Forzar prolongada" action={() => fixture.controls.advance('prolonged')} />
        <Tool label="Asignar conductor de prueba" action={() => fixture.controls.advance('assigned')} />
        <Tool label="Conductor cancela (prueba)" action={fixture.controls.driverCancels} />
        <Tool label="Offline" action={() => fixture.controls.setConnection('offline')} />
        <Tool label="Reconectando" action={() => fixture.controls.setConnection('reconnecting')} />
        <Tool label="Restablecer conexión" action={() => fixture.controls.setConnection('online')} />
        <Tool label="Sin ubicación" action={() => { fixture.controls.setLocationAvailable(false); invalidateFixtures(); }} />
        <Tool label="Con ubicación" action={() => { fixture.controls.setLocationAvailable(true); invalidateFixtures(); }} />
        <Tool label="Con parada de prueba" action={() => { fixture.controls.setStop(true); invalidateFixtures(); }} />
        <Tool label="Sin parada" action={() => { fixture.controls.setStop(false); invalidateFixtures(); }} />
        <Tool label="Fallar siguiente operación" action={fixture.controls.failNext} />
      </View>
      </ScrollView>
    </View> : null}
  </View>;
}
function Tool({ label, action }: { label: string; action: () => void }) {
  return <Pressable accessibilityRole="button" onPress={action} style={styles.tool}><VimaText variant="caption">{label}</VimaText></Pressable>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, overlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: t.colors.carbon, opacity: 0.65 },
  tools: { maxHeight: '65%', backgroundColor: t.colors.white, borderTopLeftRadius: t.radii.sheetPx, borderTopRightRadius: t.radii.sheetPx },
  toolContent: { padding: t.spacing.mobileHorizontalMarginPx, gap: t.spacing.scalePx[1] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.scalePx[1] },
  tool: { padding: t.spacing.scalePx[1], borderColor: t.borders.standardColor, borderWidth: t.borders.standardWidthPx, borderRadius: t.radii.smallPx },
});
