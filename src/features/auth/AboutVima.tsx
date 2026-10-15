import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Updates from 'expo-updates';
import { View } from 'react-native';
import { VimaText } from '../../design/primitives';
import { useVimaTheme } from '../../design/themes';
import { installedVersion } from './appVersion';

/** Informational only: no update check, download, reload or session operation. */
export function AboutVima() {
  const theme = useVimaTheme();
  // SDK 57 ExponentConstants.manifest is the app.config embedded in the binary.
  // Constants.expoConfig instead prefers the running OTA's manifest.
  const native = requireOptionalNativeModule<{ manifest?: unknown }>('ExponentConstants');
  const version = installedVersion(native?.manifest, Updates, __DEV__);
  return <View testID="vima-about" style={{ gap: 4 }}>
    <VimaText variant="bodySmall">Acerca de Vima</VimaText>
    <VimaText variant="caption" style={{ color: theme.roles.textSecondary }}>Versión del APK · {version.apkVersion}</VimaText>
    <VimaText variant="caption" style={{ color: theme.roles.textSecondary }}>Actualización · {version.update}</VimaText>
  </View>;
}
