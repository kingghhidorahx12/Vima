# Decisiones vigentes de Vima P0

Este documento registra las decisiones proporcionadas en la solicitud y reflejadas en el código. No define UX ni dirección visual.

| Decisión proporcionada | Implementación |
| --- | --- |
| Expo SDK 57 estable / React Native 0.86.x | Dependencias compatibles instaladas con Expo; lockfile reproducible. |
| TypeScript strict | `tsconfig.json` extiende Expo y activa strict. |
| Hermes / New Architecture | Defaults nativos de SDK 57/RN 0.86; no se añaden los campos legados jsEngine/newArchEnabled retirados del esquema. Se comprueba su configuración generada con prebuild. |
| Expo Router como única navegación | `expo-router/entry`, `app/_layout.tsx`, rutas dentro de `app/`. |
| Development Builds desde el inicio | `expo-dev-client`, scripts nativos y perfiles EAS development. |
| MapLibre renderer móvil Android/iOS | MapLibre React Native 11.4 vuelve a ser activo; TomTom Orbis Map Display/Assets suministrará el style compatible cuando se apruebe su configuración. La migración Google permanece sólo en su rama histórica. |
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
| Modelos Vima agnósticos | Coordinate/Bounds/CameraTarget/GeoJSON y apariencias internos. MapLibre traduce a sources/layers/markers dentro de `src/map/`. Vehículo sin render React por frame. |
| Vehicle motion 10–15 Hz / snap configurable | Worklets con salida a 12 Hz y criterio de salto inyectado; sin umbral arbitrario. |
| Reduced Motion central para UI y mapa | Provider del SO/preferencia local; navegación y ruta por fade, sin draw/scales/loops decorativos, vehículo/cámara con snap según el contrato técnico previo. |
| Configuración style TomTom por entorno | `EXPO_PUBLIC_MAP_STYLE_URL` es la entrada única al style compatible de Orbis Assets/Map Display. URL/key/style finales pendientes. DEV sin URL usa OpenFreeMap Positron sólo para revisión; release sin URL falla explícitamente. |
| Places/Geocoding/Routing TomTom exclusivamente backend | Places Search v3, Geocoding v2, Reverse Geocoding v2 y Routing v3 con tráfico live. La app usa sólo el contrato HTTPS Vima normalizado para esas operaciones. Gateway local P0 Node+TypeScript sin framework: adapters reales, contratos normalizados, validación/rate limit/TTL/timeout y logs sanitizados. Credencial y verificación live pendientes; auth productiva fuera de alcance. |
| Ranking regional y Vima Local Places | Favorecer cercanía al origen/usuario, Atlacomulco y región inicial, expandir a municipios cercanos sin excluir trayectos intermunicipales, y mezclar proveedor con lugares locales validados. Buckets explicables que priorizan relevancia textual antes de región, preservando orden provider: Atlacomulco y Jocotitlán, San Felipe del Progreso, El Oro, Acambay, Ixtlahuaca, Temascalcingo. Catálogo servidor pequeño con fuentes públicas, independiente de fixtures; sin pesos ni radio restrictivo. |
| Visual System v1 y Motion System v1 como fuentes de verdad P0 | Los JSON de `docs/design/` suministran tokens exactos; el handoff Markdown define semántica, comportamiento y límites. No se reinterpretan mockups como reglas funcionales. |
| Semántica de mapa aprobada | Origen verde, destino rojo, ruta activa carbón/verde profundo según contexto y completada gris; posición y heading interpolados. |
| Límites del handoff | No definir tema oscuro exacto, estilo final del mapa, grosores/opacidades por zoom, iconografía/stroke ni dimensiones aún no fijadas. La identidad master posterior sí está aprobada e integrada. |
| Primer bloque de pasajero dentro del shell persistente | Inicio, confirmación, búsqueda/expansión/prolongada y asignación son estados internos, sin una ruta por fase. Una sola categoría principal, sin selector adicional. |
| Asignación automática autoritativa | Pasajero ve ETA/conductor/PIN/vehículo; no acepta conductor ni inicia viaje. Reasignación y offline conservan contexto. |
| Fixtures explícitos sólo para desarrollo | Adaptador aislado en `src/dev/passenger`, controles en DevMenu, guard `__DEV__` más EXPO_PUBLIC_VIMA_FIXTURES=1 y comprobación del bundle release. Live mediante EXPO_PUBLIC_VIMA_API_BASE_URL, sin fallback silencioso. Sin debug en viewport, oferta ficticia ni fixtures en servicios productivos. |
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

Integración vigente: [TomTom geoespacial P0](TOMTOM_GEOSPATIAL.md), con MapLibre activo, contratos backend y límites de verificación. El trabajo neutral creado durante la rama Google se conserva; esa rama no se reescribió.

## Alcance aprobado de integración live P0

Node/fetch/HTTP estándar, key servidor separada del proceso Expo, sesiones y rate limit en memoria
con defaults operacionales DEV configurables. Sin auth/cloud/matching/pagos. La geoespacialidad
produce vista previa de ruta: precio/pago opcionales hasta cotización autoritativa, CTA de solicitud
deshabilitado sin ambos. No hay recientes personales falsos. Se conserva composición y flujo fixture.

Splash Android crece de160 a183dp por medición alpha y círculo seguro, sin editar artwork;
[derivación y límites](SPLASH_ANDROID_P0.md). La decisión posterior incorpora una
`VimaLaunchSurface` propiedad de la app entre el splash nativo y el mapa listo.

## Búsqueda local y mapa P0 aprobados

| Decisión aprobada | Implementación |
| --- | --- |
| Search vacía: Favoritos → Recientes → Populares en tu zona → Vima Local destacados | No se solicita una lista genérica TomTom antes de escribir. |
| Durante escritura, una lista mezclada local primero | Favoritos, Recientes, Vima Local y cache aparecen inmediatamente; Suggest actualiza tras 200 ms, sin badges de proveedor ni vaciado entre caracteres. |
| Ranking regional y geografía explícita | Coincidencia de entidad/tipo primero; consultas ambiguas sesgadas hacia Atlacomulco, municipio escrito respetado y candidatos lejanos disponibles. |
| Identidad canónica y dedupe de sucursales | ProviderRef/mapping explícito o alias explícito con verificación espacial; similitud de nombre + proximidad no bastan. |
| Recientes privados | Últimos 16 destinos realmente confirmados; no almacenar queries ni resultados vistos. |
| Popularidad colectiva contextual | Sólo `place_selected`, `destination_confirmed`, `trip_completed`; nunca `search_performed`. `trip_completed` no se emite sin backend de viaje. |
| Aportes de lugar | Nombre y punto obligatorios; `pending` utilizable por su creador, sin elevarse a catálogo público verificado. |
| Cámara Search | Search lock impide refit por altura del sheet; ruta/destino/vehículo anteriores se ocultan sólo en presentación. Recenter sigue siendo intención explícita. |
| Controles compactos | Recenter independiente y Capas con Tráfico e Incidentes. No tercer toggle de Siniestros. |
| Credenciales separadas | `TOMTOM_API_KEY` sólo gateway; `EXPO_PUBLIC_TOMTOM_DISPLAY_KEY` móvil para Orbis Map Display/Traffic cuando esté configurada. Style productivo aún pendiente. |
| Movimiento y lanzamiento | Pins/ruta usan tiempos aprobados, Reduced Motion elimina motion espacial/loops, launch surface usa asset aprobado y sale al quedar listo el mapa sin retraso decorativo. |

## Motion y pricing P0 — decisiones aprobadas 2026-10-02

| Decisión | Aplicación |
| --- | --- |
| Ubicación: core siempre visible y pulso externo | Opacidad del núcleo 1; sólo anillo animado, sin loop en Reduced Motion/background. |
| Ruta viva | Reveal inicial y señal discreta repetida sobre base estable; ruta completa estática en Reduced Motion. |
| Launch controlado por la app | Asset aprobado, pulso breve y salida al quedar listo el mapa; sin espera mínima ni cambio al native splash 183 dp. |
| Autoridad de pricing | Gateway Vima; el móvil envía draft y operationId, nunca precio/métricas/perfil como autoridad. |
| Fórmula sin surge | max(minimum, base + distance × kmRate + duration × minuteRate) + extras explícitos. |
| Minor units y rounding final | Enteros seguros; aritmética racional exacta y half_up, incremento técnico 1 centavo por defecto. |
| URBANO / REGIONAL | Todos los puntos en misma región o itinerario intermunicipal; región no clasificable falla cerrada. |
| Overrides | Corredor específico precede REGIONAL; dirección explícita; tercer municipio usa REGIONAL; ambigüedad rechazada. |
| Peajes/extras | Sólo configuración explícita, después del mínimo; nunca inferidos de ruta/TomTom/nombre. |
| Config comercial externa | VIMA_PRICING_CONFIG_PATH server-only, versionada; sin tarifas comerciales hardcodeadas ni fallback. |
| Cotización inmutable | TTL 300 s configurable, store P0 en memoria, operationId idempotente y distinto de requestId. |
| Renovación visible | Sin polling/refetch por reconexión mientras válida; expiración renueva y exige revisión nuevamente. |
| Gates separados | Pricing no habilita pago ni request/matching live inexistente. |

## Fit confirmado y media opcional P0 — decisiones aprobadas 2026-10-02

| Decisión | Aplicación |
| --- | --- |
| Fit completo sólo tras confirmar ubicaciones | Encuadrar origen, geometría total y destino con padding del viewport útil, sheet y controles; Search no emite fit. Reduced Motion conserva la acción sin animación prolongada. |
| Ruta legible sobre Traffic | Casing claro con colores del Visual System debajo del trazo Vima; Traffic conserva sus capas y semántica. |
| Miniaturas como enriquecimiento opcional | Prioridad: media Vima propia/licenciada, fuente externa futura permitida, icono Vima por categoría. Search, ranking, dedupe y selección no dependen de imágenes. |
| Identidad de imagen estable | `canonicalPlaceId` identifica el lugar; `PlaceImageRef` identifica el asset o referencia externa. URL efímera nunca es identidad ni se guarda en Favoritos/Recientes. |
| Catálogo de media controlado | Binarios y manifiesto con provenance viven fuera del repo mediante `VIMA_PLACE_MEDIA_DIR`; sólo imágenes aprobadas de Local Places verificados se publican. Aportes `pending` no reciben foto pública ni upload en P0. |
| Fotos proveedor fuera de P0 | No integrar TomTom POI Photos ni Google Places Photos; `source: external` sólo deja abierto un contrato futuro sujeto a derechos y metadata por proveedor. |
| Español visible P0 | Categorías de incidentes reales traducidas; desconocidas muestran `Incidente vial`, sin enums ni fallback inglés visible. |

## Acento secundario P0 — decisión visual aprobada 2026-10-03

- Azul Vima Accent: `#2F80FF`, pressed `#1E6FE8`, superficie suave `#EAF3FF` y halo
  derivado. El JSON de tokens incorpora estos valores; el halo usa el azul al 16%.
- Ruta principal azul con casing claro, ubicación actual y controles activos del mapa,
  foco/selección secundarios y realce informativo. Esta decisión sustituye el uso de
  verde/carbono para la ruta principal del pasajero.
- Verde conserva CTA principal, éxito, acción de negocio, origen e identidad; rojo conserva
  destino y estados críticos. No se modifica el Motion System ni las reglas funcionales.
- Se aprueba una ronda acotada de coherencia de iconos y superficies P0, sin rediseñar layouts.
  La elección técnica de Material Symbols reutiliza la fuente ya instalada; no representa
  un nuevo asset master de marca ni una migración global de iconografía.
