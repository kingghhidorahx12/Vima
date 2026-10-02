# Estado real del proyecto

Fecha: 2026-10-01. Repositorio `kingghhidorahx12/Vima`.
Rama: `codex/tomtom-geospatial-android-p0`, creada desde el HEAD de
`codex/google-geospatial-android-p0`. La rama Google se conserva intacta como historia técnica;
no se hizo reset, rebase ni merge a main.

## DECIDIDO

- MapLibre React Native es de nuevo el renderer móvil Android/iOS. TomTom Orbis Map Display/Assets
  es la dirección de cartografía, con style final aún sin suministrar.
- Places Search v3, Geocoding v2, Reverse Geocoding v2 y Routing v3 con tráfico live son servicios
  del futuro backend Vima. La app nunca llama directamente a web-services que exijan credenciales de servidor.
- Modelos Vima neutrales entre feature y mapa/backend. Ranking regional centrado en Atlacomulco,
  cercanía y expansión intermunicipal, con Vima Local Places sólo tras validación de datos.
- P0 visual/funcional, Visual/Motion v1, ubicación expo-location, sheet, matching, branding y
  aislamiento de fixtures conservados.

## IMPLEMENTADO

- `VimaMap`, `Camera`, `MapMarker`, `RouteLayer`, `DestinationLayer` y `VehicleLayer` activos sobre
  MapLibre. Una sola instancia de mapa por shell; ruta GeoJSON y vehicleMotion por worklets sin
  render React por frame. Fit de ruta completa con padding del sheet y arco corto al cruzar el
  antimeridiano; cámara inmediata con Reduced Motion. Marcadores y colores Vima conservados.
- `EXPO_PUBLIC_MAP_STYLE_URL` sigue siendo la entrada única. En DEV sin valor se muestra Positron
  para revisión; fuera de DEV se exige URL HTTPS explícita. No hay style TomTom productivo incluido.
- Eliminados renderer/bridge/config/scripts específicos Google, Map ID y dependencia
  `react-native-maps`. MapLibre 11.4 permanece. Sin SDK nativo TomTom.
- Cliente móvil Vima con sesión de autocomplete/search/lookup, geocoding/reverse y rutas; respuestas
  estrictamente normalizadas, validación de geometría/coordenadas, timeout, cancelación y errores
  semánticos. No hay backend en el repo y este cliente no se conecta aún al PassengerGateway live.
- `VimaLocalPlace` y `mergePlaces` separados de fixtures DEV. Catálogo productivo vacío. Ranking
  sólo al recibir política explícita con pesos; resultados de otros municipios no se filtran.
- Contrato de endpoints y adaptación prevista a TomTom en [TOMTOM_GEOSPATIAL.md](TOMTOM_GEOSPATIAL.md).

## VERIFICADO LOCALMENTE

- TypeScript y lint OK; **47/47 tests** OK, incluidos Passenger P0 y MapLibre con dobles
  nativos: instancia persistente, fit/padding/Reduced Motion, markers, ruta, vehículo,
  modelos neutrales y frontera backend. **13 worklet transforms** OK.
- Expo Doctor **21/21**, `expo install --check` OK; Expo config resuelto conserva owner,
  projectId/package y plugin MapLibre, sin configuración Maps SDK. Android prebuild OK, sin
  metadata Maps SDK. Exports Hermes release Android/iOS OK; aislamiento de fixtures en ambos OK.
- Búsqueda estática en fuentes, configuración y manifest Android sin imports/config/keys Google
  productivos; `.env` real, carpetas nativas, bundles y cachés siguen ignorados por git.
- Los dobles y exports **no certifican** tiles Orbis, sprites/glyphs, rendimiento Fabric ni
  comportamiento en Android físico.

## PENDIENTE

- Backend Vima: implementar endpoints/auth/rate limiting/normalización de Places Search v3,
  Geocoding v2, Reverse v2 y Routing v3 live; suministrar credenciales TomTom **sólo servidor**.
  Integrar la respuesta real al PassengerGateway y su autoridad de solicitud/cotización.
- Style Orbis Assets/Map Display aprobado, URL HTTPS usable por MapLibre, política de key pública
  si procede y comprobación física de tiles/sprites/atribución. El fallback DEV no es signoff.
- Pesos de ranking/radios, identificadores y alcance de municipios cercanos, y lugares locales
  validados. No se usan lugares de fixtures como catálogo productivo.
- Nuevo Development Build Android después de retirar `react-native-maps`; esta tarea no ejecuta
  EAS Build. Validación física de cámara/padding/markers/ruta/vehículo/gestos/ubicación,
  Reduced Motion, teclado y P0 completo aún pendiente. Si no hay JDK local, export/prebuild no
  equivalen a ejecutar el APK.
- Asset de vehículo orientado y reglas de grosor/opacidad por zoom; regla tras pan manual y
  composición terminal de 15 min siguen pendientes, sin inventar parámetros.

## P0 conservado

Inicio → selección/edición → Confirma tu viaje → matching normal/prolongado/asignado dentro del
mismo PassengerRideShell y VimaRideSheet. Header/logo final, icono y splash aprobados; sheet
radio 28/margen 20, allowedOffsets/snap por estado y teclado. Origen loading/automático/manual/
error con elección manual protegida. Matching prolongado desde 120 s, límite configurable de
15 min, cancelación autoritativa para Editar/Programar y asignación concurrente prevalente.
TanStack Query para autoridad remota, Zustand UI, SecureStore/SQLite separados, Inter,
Visual/Motion v1 y haptics centrales. Fixtures sólo en `src/dev/passenger/` y ruta DEV.
EAS continúa en `@kingghidorahx12/vima`, developmentClient:true y APK interno.
