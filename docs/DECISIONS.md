# Decisiones vigentes de Vima P0

Este documento registra las decisiones proporcionadas en la solicitud y reflejadas en el código. No define UX ni dirección visual.

| Decisión proporcionada | Implementación |
| --- | --- |
| Expo SDK 57 estable / React Native 0.86.x | Dependencias compatibles instaladas con Expo; lockfile reproducible. |
| TypeScript strict | `tsconfig.json` extiende Expo y activa strict. |
| Hermes / New Architecture | Defaults nativos de SDK 57/RN 0.86; no se añaden los campos legados jsEngine/newArchEnabled retirados del esquema. Se comprueba su configuración generada con prebuild. |
| Expo Router como única navegación | `expo-router/entry`, `app/_layout.tsx`, rutas dentro de `app/`. |
| Development Builds desde el inicio | `expo-dev-client`, scripts nativos y perfiles EAS development. |
| Google Maps SDK objetivo Android | react-native-maps 1.27.2 elegido por Expo 57, PROVIDER_GOOGLE, key de build y Map ID opcional. MapLibre 11.4 se conserva temporalmente para rollback/paridad e iOS; no se retira antes de signoff Android físico. |
| Reanimated 4.5.x + Worklets | Versiones seleccionadas por Expo; transformación mediante `babel-preset-expo`. |
| Gesture Handler ~2.32 | Root view y base gestual propia del sheet. |
| TanStack Query remoto / Zustand sólo UI | QueryClient, trip queries/comandos/reconciliación; store de interacción efímera. |
| Servidor autoritativo | Sin éxitos optimistas de comandos críticos; reconciliación monótona e invalidación realtime. |
| SecureStore para credenciales | `services/storage/credentials.ts`. |
| SQLite/KV para preferencias y recuperación no sensible | Formatos versionados y allowlist en `services/storage`. |
| Haptics semánticos centralizados | Catálogo exacto del JSON en `motion/haptics.ts`; lint impide imports directos dispersos. Los éxitos de negocio requieren confirmación del servidor. |
| Sistema visual propio, sin UI kit | Tokens importados directamente del JSON aprobado, tema claro e Inter 400/500/600/700. Sin NativeWind, Paper ni Tamagui. |
| VimaRideSheet propio | Gesture Handler + Reanimated; offsets 24/52/88% delimitan drag y cada estado define sus `allowedOffsets` finales. Los estados P0 actuales son single-snap y siempre regresan a su `targetOffset` con `motionTimings.sheetSnap`; sólo un estado que declare varios offsets puede asentarse en varios. Radio 28, entrada 300 ms, cierre 240 ms y drag 1:1. Sin bottom-sheet externo ni spring genérico. |
| Shells persistentes / fases internas | PassengerRideShell y DriverRideShell comparten RideShell sin key por fase. |
| Modelos Vima agnósticos | Coordinate/Bounds/CameraTarget/GeoJSON internos. Google usa Polyline/Marker; MapLibre conserva sus sources/layers. Vehículo sin render React por frame. |
| Vehicle motion 10–15 Hz / snap configurable | Worklets con salida a 12 Hz y criterio de salto inyectado; sin umbral arbitrario. |
| Reduced Motion central para UI y mapa | Provider del SO/preferencia local; navegación y ruta por fade, sin draw/scales/loops decorativos, vehículo/cámara con snap según el contrato técnico previo. |
| Configuración Google por entorno; MapLibre transitorio | GOOGLE_MAPS_ANDROID_API_KEY sólo build, Map ID público opcional. Android configurado usa Google; DEV sin key advierte y usa MapLibre; release Android sin key falla explícitamente. Style Google Cloud pendiente. MapTiler Cloud Flex/Streets Pastel deja de ser objetivo productivo; Positron y la URL legacy sólo se conservan para rollback/iOS. |
| Places API (New) y Routes API exclusivamente backend | Credenciales separadas/restringidas sólo en servidor, DRIVE/TRAFFIC_AWARE, sesiones autocomplete y respuestas normalizadas. Sin backend en este repo: contratos/adapters móviles preparados, endpoints y conexión live pendientes; no llamadas móviles a Google Places/Routes. |
| Visual System v1 y Motion System v1 como fuentes de verdad P0 | Los JSON de `docs/design/` suministran tokens exactos; el handoff Markdown define semántica, comportamiento y límites. No se reinterpretan mockups como reglas funcionales. |
| Semántica de mapa aprobada | Origen verde, destino rojo, ruta activa carbón/verde profundo según contexto y completada gris; posición y heading interpolados. |
| Límites del handoff | No definir tema oscuro exacto, assets maestros, estilo final del mapa, grosores/opacidades por zoom, iconografía/stroke ni dimensiones aún no fijadas. |
| Primer bloque de pasajero dentro del shell persistente | Inicio, confirmación, búsqueda/expansión/prolongada y asignación son estados internos, sin una ruta por fase. Una sola categoría principal, sin selector adicional. |
| Asignación automática autoritativa | Pasajero ve ETA/conductor/PIN/vehículo; no acepta conductor ni inicia viaje. Reasignación y offline conservan contexto. |
| Fixtures explícitos sólo para desarrollo | Adaptador aislado en `src/dev/passenger`, controles en DevMenu, guard `__DEV__` y comprobación del bundle release. Sin debug en viewport, oferta ficticia ni fixtures en servicios productivos. |
| Assets/referencias aprobados (histórico) | Header v2 y sus SVG quedan como referencia archivada; la identidad final aprobada posterior los sustituye en runtime. No reconstruir/recolorear ni usar texto runtime. Vehículo/iconografía de producto aún pendientes. |
| Identidad final aprobada sustituye branding provisional | Header usa `vima_header_lockup_final.png`; app icon iOS/Android y adaptive foreground usan el nuevo artwork aprobado exportado uniformemente a 1024×1024; splash usa `vima_splash_lockup_final.png` sobre fondo blanco. Los PNG fuente quedan intactos. Los antiguos assets P0 de header/icon no se usan en configuración ni UI; se omite monochrome porque no se entregó variante aprobada para la nueva identidad. Se conservan `owner`, EAS projectId, identificadores y plugin/permisos expo-location. |
| Inicio muestra Origen y Destino | Ambos editables desde el principio; Destino sigue siendo primario. Se reutiliza selección existente. |
| Origen automático/manual sin sobrescritura | Estados de carga, automático, manual y no disponible. La elección manual prevalece ante geolocalización tardía. Permiso no obligatorio para solicitar con origen manual. |
| Matching normal y espera más larga | Normal 0–60 s; 60–120 s sólo copy discreto, sin alternativas ni detener búsqueda. Configuración central, separada de motion. |
| Prolongado desde 2 minutos | Umbral 120 s; misma superficie/mapa/shell, búsqueda automática mientras no haya asignación, acción del usuario o límite. |
| Seguir buscando DESCARTADO | Sin botón ni comando de continuación; entrar a prolongado no pausa la búsqueda. |
| Editar / Programar / Cancelar desde prolongado | Disponibles desde 120 s. Editar y Programar esperan cancelación autoritativa y preservan origen/destino/paradas/cotización. |
| Editar una solicitud activa | Detener antes de modificar; nueva solicitud después de confirmar los cambios. Una asignación concurrente prevalece. |
| Programar desde matching | Cancelar búsqueda inmediata y entregar datos al boundary existente; no inventar UI completa ni confirmar una reserva inexistente. |
| Límite inicial configurable de 15 minutos | limitMs=900000 en política P0 testeable. Estado terminal preparado; composición específica pendiente sin pantalla nueva. |

Fuentes aprobadas incorporadas: [handoff final v1](design/VIMA_VISUAL_MOTION_HANDOFF_FINAL_v1.md), [tokens visuales](design/vima.visual.final.json) y [tokens de motion](design/vima.motion.final.json). La solicitud posterior al bootstrap autoriza únicamente el primer bloque de pasajero descrito en [PASSENGER_P0.md](PASSENGER_P0.md). Backend real y siguientes bloques continúan pendientes. Los elementos aún no definidos se conservan como pendientes, sin elevar fixtures a decisiones de producto.

Fuentes técnicas contrastadas con el código instalado: [SDK 57](https://expo.dev/changelog/sdk-57), [Router](https://docs.expo.dev/router/installation/), [Reanimated en SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/), [MapLibre Expo](https://maplibre.org/maplibre-react-native/docs/setup/expo/) y [API v11](https://maplibre.org/maplibre-react-native/docs/setup/migrations/v11/).

Migración vigente: [Google geoespacial Android P0](GOOGLE_GEOSPATIAL.md), con configuración, contratos backend, verificaciones y límites de paridad. La decisión Google sustituye la dirección MapTiler productiva previa sin eliminar todavía la implementación MapLibre.
