# Vima P0

Bootstrap nativo en la raíz del repositorio. Expo SDK 57, React Native 0.86, TypeScript strict, Hermes, New Architecture y Expo Router. Requiere Development Build; MapLibre no forma parte de Expo Go.

## Desarrollo

1. Instalar Node compatible con `package.json` y ejecutar `npm ci`.
2. Copiar `.env.example` a `.env.local` y definir `EXPO_PUBLIC_MAP_STYLE_URL` cuando haya un estilo aprobado. Es información pública, nunca secretos.
3. Con el toolchain de Android configurado: `npm run android`. En macOS con Xcode/CocoaPods: `npm run ios`.
4. Alternativamente, generar el APK Android en EAS siguiendo los pasos siguientes. Para simulador iOS, usar `development-simulator`.
5. Instalar el Development Build y ejecutar `npm start`. La ronda de origen real añadió `expo-location`: el APK anterior debe reconstruirse para incluir ese módulo y sus permisos de primer plano.

La entrada de desarrollo abre `/dev/passenger`: Inicio → Confirmar ubicaciones → Confirma tu viaje → Buscando un conductor → Búsqueda prolongada / Conductor asignado. Los controles de escenarios están separados en el menú del Development Client, bajo **Vima · controles de prueba**; no ocupan la pantalla de producto. Las instrucciones están en [PASSENGER_P0.md](docs/PASSENGER_P0.md). La entrada productiva sigue pendiente de gateway/configuración reales y excluye estos fixtures.

`/dev/bootstrap` conserva las comprobaciones técnicas anteriores de Router/providers/Inter/MapLibre/sheet. Ambas rutas están protegidas por `__DEV__` y no representan datos ni servicios reales.

Sin URL, sólo `__DEV__` usa MapLibre Demo Tiles, un demo regional/mundial que puede verse amarillo a zoom de ciudad. No es un style urbano aprobado ni ese color demuestra un fallo de MapLibre. El style urbano DEV/productivo sigue pendiente. Fuera de desarrollo, `VimaMap` rechaza configuración ausente o no HTTPS. Cambiar variables públicas requiere reiniciar Metro/reexportar; no son secretos de runtime.

Para ocultar el engrane flotante **Tools** en el Development Build, abrir el menú de desarrollo de Expo (agitar el teléfono) y desactivar **Tools button**. Los controles de fixtures siguen accesibles en ese menú mediante **Vima · controles de prueba**; el cambio es una preferencia del Development Client y no altera la UI de Vima.

## Development Build Android con EAS

El perfil `development` declara `developmentClient: true`, distribución interna y `android.buildType: apk`. `expo-dev-client` y su plugin ya están instalados/configurados. La compilación ocurre en EAS y no necesita JDK/Android SDK local.

Desde la raíz del repositorio, ejecutar personalmente:

```powershell
# Sólo si todavía no hay una sesión Expo iniciada:
npx eas-cli@latest login

# El proyecto ya está vinculado a @kingghidorahx12/vima.
```

`app.config.ts` contiene el `owner` y el ID real del proyecto EAS. Para generar un APK nuevo:

```powershell
npx eas-cli@latest build --platform android --profile development
```

En el primer build, EAS puede solicitar generar un keystore Android o usar uno existente; la selección corresponde al propietario de la cuenta. Esta ronda visual no ejecutó un build.

Cuando termine, abrir el enlace del APK en el teléfono Android e instalarlo. En el ordenador, ejecutar `npm start` (equivale a `expo start --dev-client`), mantener ambos dispositivos en la misma red y abrir el proyecto desde el Development Build mediante el QR de Metro. La entrada de desarrollo abre `/dev/passenger` automáticamente. El APK necesita Metro para cargar este flujo durante la revisión.

## Estructura e integración

- `app/`: rutas/layouts. Nunca una ruta por fase del viaje.
- `docs/design/`: handoff final y JSON aprobados, fuentes de verdad P0 sin modificaciones.
- `src/design/`: tokens derivados del JSON, Inter/tema claro, primitives y `VimaRideSheet`.
- `src/motion/`: Motion System v1, Reduced Motion central, helpers y catálogo de haptics semánticos.
- `src/map/`: MapLibre, cámara y GeoJSON sources/layers nativas.
- `src/features/`: dominios P0; shells de pasajero/conductor persistentes.
- `src/services/`: API, storage y realtime sin backend simulado.

Consultar [estado real](docs/PROJECT_STATE.md), [decisiones implementadas](docs/DECISIONS.md) y [contratos de integración](docs/INTEGRATION.md).

## Validación

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run check:worklets
npm run doctor
npx expo install --check
npm run export:native
npm run check:fixture-isolation
```

`expo export` valida el bundle, no compila ni ejecuta los módulos nativos. El checklist pendiente de dispositivo está en `docs/PROJECT_STATE.md`. Las carpetas `android/` e `ios/` se generan con Expo prebuild y no se versionan.
