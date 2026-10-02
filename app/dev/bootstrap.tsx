import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Button, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PassengerRideShell } from '../../src/features/passenger/PassengerRideShell';
import { Camera } from '../../src/map/Camera';
import { useMotionPolicy } from '../../src/motion/ReducedMotion';
import { VimaText } from '../../src/design/primitives';
import { createRideSheetInteraction } from '../../src/design/components/VimaRideSheet';
import { rideSheetGeometry, type SheetSnap } from '../../src/design/components/rideSheetGeometry';
import { semanticHaptics } from '../../src/motion/haptics';
import { ScreenTransition } from '../../src/motion/ScreenTransition';

/** Technical fixture only. Controls and the initial snap are not a P0 screen specification. */
export default function Bootstrap() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [panel, setPanel] = useState(false);
  const [height, setHeight] = useState(0);
  const [snap, setSnap] = useState<SheetSnap>(2);
  const interaction = useMemo(() => {
    if (height <= 0) return undefined;
    const { targetOffset } = rideSheetGeometry(height, snap);
    return createRideSheetInteraction(height, targetOffset, [targetOffset]);
  }, [height, snap]);
  const policy = useMotionPolicy();
  if (!__DEV__) return <Redirect href="/" />;
  return <ScreenTransition style={styles.fill}><SafeAreaView style={styles.fill}>
    <View style={styles.fill} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
    <PassengerRideShell
    sheet={{ interaction }}
    map={{ onDidFinishLoadingMap: () => setLoaded(true), onDidFailLoadingMap: () => setFailed(true) }}
    mapContent={<Camera />}
    renderPhase={() => <>
      <VimaText variant="h3">Vima · comprobación de desarrollo</VimaText>
      <VimaText variant="bodySmall">{failed ? 'Error al cargar el mapa' : loaded ? 'MapLibre cargado' : 'Esperando carga de MapLibre'}</VimaText>
      <VimaText variant="caption">Reduced Motion: {policy.reducedMotion ? 'activo' : 'inactivo'}</VimaText>
      <Button title="Cambiar contenido" onPress={() => { setPanel((value) => !value); void semanticHaptics('buttonChip'); }} />
      <Button title="Cambiar snap 24/52/88" onPress={() => setSnap((value) => ((value + 1) % 3) as SheetSnap)} />
      <VimaText variant="caption">{panel ? 'Fixture B · mismo mapa y shell' : 'Fixture A · mismo mapa y shell'}</VimaText>
    </>}
  /></View></SafeAreaView></ScreenTransition>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
