# Estado real del proyecto

Actualizado 2026-10-09 en `codex/driver-maplibre-layer-crash-fix-p0`,
desde `codex/passenger-structural-sharing-cross-id-fix-p0` @ `974c539bec39d68741357efbf48deae0bbc4a003`.
Sin merge a main.

Las secciones de implementación son cronológicas; los ajustes más recientes
sustituyen los valores visuales descritos en las secciones anteriores.

## IMPLEMENTADO

### Crash Android de la capa de adquisición Driver — 2026-10-09

- Se quitó `Animated.createAnimatedComponent(Layer)` del halo de adquisición:
  Android rechazaba su `animatedProps.paint` con `0 is not a valid MapLibre layer style`.
  `AnimatedSource` conserva posición/heading y añade `acquisition` a la feature
  real. Un `Layer` normal lee esa propiedad mediante interpolaciones MapLibre:
  radio 28→36, opacidad 0.18→0; Reduced Motion fija acquisition=1.
  Sin ubicación, GeoJSON vacío. Base/automóvil/orden, assets y motion intactos.
- **Validación automatizada:** focal Driver map, style spec, TypeScript, lint,
  suite completa, worklets y checks afectados ejecutados en esta rama.
- **Android físico PENDIENTE:** abrir Driver sin error de render; OFFLINE→AVAILABLE
  sólo muestra automóvil al recibir ubicación real.

### Driver Map v1 y preferencia global Sol/Luna — 2026-10-09

- `DriverVehicleMarker` sustituye el puck Passenger. Artwork propio local SVG +
  PNG 1x/3x light/dark: footprint 52×64, automóvil 38×50, halo base 56 y adquisición
  one-shot hasta 72; misma geometría en ambos themes, sin loops ni recursos remotos.
  La fuente animada mantiene la cadencia existente de 12 Hz y el vehículo queda
  sobre ruta/Traffic/basemap. Sin location real no hay feature; Atlacomulco sólo
  sirve de cámara fallback.
- Matriz autoritativa: OFFLINE/LOCATING/AVAILABLE/PAUSED sólo vehículo con location;
  OFFER vehículo + pickup sin ruta; ASSIGNED añade `routeToOrigin` existente;
  ARRIVED_PICKUP conserva pickup sin ruta; IN_PROGRESS/PAYMENT_PENDING/terminal
  no agregan geometría ni navegación. Primitive pickup compartido conserva el
  artwork/motion Passenger. Offer, CTAs, contratos y lifecycle no cambian.
- Heading Driver opcional: conserva último válido [0,360), arco corto 359→0;
  sin histórico permanece null y usa símbolo alineado al viewport sin rotación
  geográfica inventada. Scope de sesión conserva el boundary por cuenta existente.
  Opción explícita essential en `useVehicleMotion` mantiene smoothing funcional
  con Reduced Motion; Passenger default, validación estricta y fences permanecen.
- Cámara por intención: primera location real, entrada a OFFER, ASSIGNED e
  IN_PROGRESS. GPS/revisions/countdown/ARRIVED/PAYMENT no generan nuevos fits.
  Brújula sólo solicita bearing=0. Chrome derecho Sol/Luna 40×40, brújula y Capas
  usa `RideShell.mapOverlay` absoluto/box-none antes del sheet, sin cambiar sus
  mediciones ni geometría. No se remonta mapa/shell durante cambio de fase/theme.
- Capabilities separadas traffic/incidents derivadas de display key y endpoints
  reales configurados; no se renderiza capa unavailable aunque la preferencia
  esté activa. Row individual disabled; ambas ausentes deshabilitan Capas.
  Se reutilizan layers, preferencias y cierre sincronizado del menú.
- Preferencia global: `stored > env default > light`, únicamente light/dark.
  Root espera fonts + preferencias; storage inválido/fallido usa default sin flash
  productivo. Toggle actualiza inmediatamente context/StatusBar/mapVariant y
  serializa escrituras en el registro existente preservando reducedMotion.
  Sun/light_mode U+E518 y moon/dark_mode U+E51C verificados en cmap bundled.
  Crossfade/rotación discreta usa timing focus; Reduced Motion sólo crossfade.
  URLs custom de mapa siguen autoritativas.
- **VERIFICADO automatizado:** suite completa **321/321** (12 nuevos focales),
  gateway/matching/lifecycle/pricing **87/87**, TypeScript, lint, worklets (22),
  splash, schema MapLibre, exports Hermes release Android/iOS y bundles DEV.
  Fixture isolation DEV/release y checks release pricing/server/paths/credenciales
  pasan. Expo Doctor **20/21** sólo por los cinco patches SDK 57 ya conocidos;
  no se actualizaron dependencias. Warning Node MODULE_TYPELESS_PACKAGE_JSON
  preexistente, no bloqueante. Sin cambios nativos ni nuevo Development Build.
- **Android físico PENDIENTE:** verificar assets/densidad/halo en ambos themes,
  heading ausente→válido y 359→0, smoothing/RM/reconnect, pan sin seguimiento GPS,
  OFFER→ASSIGNED→ARRIVED→IN_PROGRESS→PAYMENT, norte sin mover centro/zoom, capas
  y safe-area/CTAs. Probar toggle rápido, reinicio con tema guardado y continuidad
  global Passenger↔Driver sin flash/remount. Lifecycle/pricing/backend/identidad
  Passenger permanecen fuera del diff.

### Structural sharing Passenger aislado por identidad — 2026-10-09

- `tripQueryOptions` sólo entrega a la reconciliación el `oldData` cuyo `id`
  coincide con el `expectedId` de la query. Al reutilizar un observer de A para B,
  el resultado anterior A deja de contaminar el structural sharing de B; el
  snapshot incoming continúa validándose estrictamente y un incoming cross-ID
  sigue fallando cerrado.
- Regresión con `QueryClient` + `QueryObserver` real reproduce A terminal cacheado,
  cambio del mismo observer a B ya recibido, y avance B rev1 → rev2 → ASSIGNED
  rev3 sin restart. `tripKey(A)` permanece intacto y las trazas B no usan A como
  previous. Sin cambios en reconciliación, identidad/epochs, realtime o backend.
- **VERIFICADO automatizado:** focal **2/2**, suite completa **309/309**,
  gateway/matching/lifecycle/pricing **87/87**, TypeScript y lint.
- Android físico **PENDIENTE**: repetir A terminal → B creado/asignado en la misma
  sesión y confirmar ausencia de `query_structural_sharing previousId=A`.

### Lifecycle autoritativo, meter, settlement y journal Driver — 2026-10-09

- RequestRecord/MatchingCoordinator extiende ASSIGNED → ARRIVED_PICKUP →
  IN_PROGRESS → PAYMENT_PENDING → COMPLETED. Active request y Driver ASSIGNED
  permanecen ocupados hasta terminal. Cancelaciones pre-PIN/no-show persistidos,
  assignmentId obligatorio y commits serializados/idempotentes; PIN sólo Passenger.
- Snapshot v4 deduplica PricingConfig exacta congelada por hash de contenido.
  Migraciones v1/v2/v3 preservadas: bases legacy activas sólo mediante equivalencia
  demostrada de version/profile/override/quote.price; mismatch falla cerrado.
- Meter durable de telemetry consecutiva con timestamp y coordenadas reales,
  segmentos geodésicos y métricas enteras. Paradas ordenadas e incurred codes
  explícitos. Finish exige última sequence confirmada; no routing/repricing remoto.
- Normal conserva quote.price exacto. Early reutiliza priceTrip con basis congelada,
  meter real, minimum normal y sólo extras incurridos. Sin cap ni penalizaciones.
  Cash recibido/problema cierra COMPLETED; disputeId estable cuando corresponde.
- Driver incorpora acciones mínimas en el shell/themes existentes. SQLite KV
  guarda outbox versionado post-PIN con IDs estables, GET antes de replay,
  acknowledgements durables y descarte stale sólo confirmado. Paradas pendientes
  no se presentan como confirmadas. Passenger refleja lifecycle/pago y conserva PIN.
- API, recuperación y procedimiento QA: [TRIP_LIFECYCLE_P0.md](TRIP_LIFECYCLE_P0.md).
  Sin cambios al PricingEngine, launcher, proveedor, navegación externa o Motion.
  Sin dependencias nuevas, cambios nativos ni EAS Build.
- **VERIFICADO automatizado:** focales lifecycle/HTTP/journal **28/28**, suite
  completa **307/307**, gateway/matching/pricing **87/87**, TypeScript y lint.
  Worklets (19 archivos), splash, export Hermes Android/iOS y bundles DEV pasan;
  aislamiento fixture/release, pricing/server, paths y credenciales pasan en
  ambas plataformas. Expo Doctor **20/21** sólo por los cinco patches SDK 57
  conocidos (expo, constants, linking, router y sqlite); no se actualizaron.
  Warning Node MODULE_TYPELESS_PACKAGE_JSON preexistente, no bloqueante.
  **Android físico PENDIENTE**: E2E ambos themes, PIN/llegada/no-show, normal/early,
  paradas/extras, pagos, modo avión/reinicio/replay, teclado/safe-area/CTAs.

### Cloudflared local y ADB opcional para QA — 2026-10-08

- En Windows el launcher resuelve y valida `cloudflared --version` primero en
  `.runtime/tools/cloudflared.exe` y después en `PATH`; el mismo comando
  resuelto inicia el Quick Tunnel. En otros sistemas conserva `cloudflared`
  desde `PATH`. No descarga, instala ni versiona binarios.
- ADB deja de ser requisito del preflight. Sólo exactamente un dispositivo en
  estado `device` inicia `adb -s <serial> logcat`; ausencia, cero dispositivos,
  múltiples, unauthorized, offline, error o salida inválida generan un warning
  específico y la sesión continúa sin seleccionar arbitrariamente un serial.
- Gateway, cloudflared y Metro conservan lifecycle crítico: su fallo limpia la
  sesión y termina non-zero. ADB se registra para cleanup si inicia, pero su
  error o salida posterior no dispara el fatal global. `adb.log` sólo existe
  cuando se intentó iniciar la captura; los demás logs conservan ubicación y
  redacción en `.runtime/qa/<timestamp>-<theme>/`.
- `npm run qa:light` y `npm run qa:dark`, el orden Gateway → health → tunnel →
  Metro, la URL automática, themes, configuración externa y cleanup de árboles
  permanecen iguales. Sin dependencias ni cambios nativos.
- **VERIFICADO automatizado:** focales del launcher **11/11**, suite completa
  **278/278**, gateway/matching/pricing **68/68**, TypeScript, lint, worklets
  (19 archivos), splash y sintaxis Node. Expo Doctor conserva **20/21** porque
  el entorno no puede resolver `exp.host`; no se cambiaron dependencias.
  QA live light/dark sin USB/ADB sigue **PENDIENTE**.

### Frontera HTTP Passenger y launcher de QA Android — 2026-10-08

- La excepción previa a `trip_reconcile` queda localizada en la frontera HTTP
  Passenger: un envelope con revision/phase inválidos o un snapshot matching
  estructuralmente inválido podía lanzar dentro de `decodeMatchingTrip` sin
  diagnóstico de origen. La reproducción separada `fetch(B)` con `id=A`
  confirma además el riesgo de identidad tardía. La nueva frontera
  `trip_http_snapshot` clasifica ambos casos antes del decode completo;
  `validateTrip`, `reconcileTripWithContext` y las invariantes de identidad
  permanecen estrictas.
- La traza DEV sanitizada registra sólo origin/endpoint lógico, `expectedId`
  cuando existe autoridad, `incomingId`, revision/phase válidos, epoch,
  accepted/rejected y una razón tipada: `id_invalid`, `id_mismatch`,
  `revision_invalid`, `phase_invalid` o `snapshot_invalid`. No incluye quote,
  coordenadas, assignment, perfil/PIN, bearer, headers ni payload completo.
  Create no confunde `requestId` con trip ID y `/active` no inventa identidad.
- La regresión A→B→C completa respuestas HTTP/realtime tardías de A y B en
  órdenes distintos: C permanece visible, query keys y revisions siguen
  aisladas, no se reinicia realtime obsoleto y Passenger no queda bloqueado.
  `adoptTripIdentity` y su epoch síncrono siguen siendo la única autoridad.
- Passenger deja de renderizar `flow.error.message`. Los errores internos de
  snapshot/identity/reconciliation se proyectan como `No pudimos actualizar tu
  viaje. Reintenta.`; otros errores no allowlisted usan copy genérico seguro,
  conservando Error, retry y request activa para diagnóstico y recuperación.
- `scripts/qa-session.cjs` implementa un único launcher para `npm run qa:light`
  y `npm run qa:dark`: preflight → Gateway → `/health` → Cloudflare Quick
  Tunnel → URL pública → Metro dev-client `--tunnel` → captura ADB. Hereda la
  configuración externa, no lee rutas personales ni imprime secretos, y
  guarda streams separados en `.runtime/qa/<timestamp>-<theme>/`.
- Ctrl+C, SIGTERM, error de startup o salida de un hijo crítico detienen nuevos
  hijos y limpian Metro, cloudflared, Gateway y ADB. En Windows se cierra el
  árbol con `taskkill /T`; en POSIX se usan grupos de proceso. El cleanup es
  idempotente y no depende de sleeps fijos.
- **VERIFICADO automatizado:** TypeScript, lint, suite completa **274/274**,
  gateway/matching/pricing **68/68**, worklets (19 archivos), splash, exports
  Hermes Android/iOS release y development, y aislamiento fixture/release y
  frontera móvil del release. Expo Doctor conserva **20/21** por no poder
  resolver `exp.host`; no se actualizaron dependencias. El check de frontera
  sobre export DEV sigue encontrando el header público `TomTom-Api-Key` de
  Orbis Display ya presente en la base; el export release pasa limpio.
- Sin dependencias ni cambios nativos. La sesión real con cloudflared, Metro,
  ADB y Android físico sigue **PENDIENTE**; no se ejecutó el launcher live.

### Driver UI final y critical viewport de Offer — 2026-10-08

- `DriverLiveScreen` sigue siendo controller. `DriverOffer` pasó a
  `src/features/driver/` junto con la presentación productiva; location,
  queries, realtime, intents, operationIds, retry y trazas permanecen en sus
  límites existentes.
- OFFLINE, LOCATING, AVAILABLE y PAUSED conservan composición `compact`;
  ASSIGNED conserva `operational`. Cada superficie separa contexto, detalle
  secundario y una action/error zone no desplazable con `flexShrink: 0`.
  `Disponible`, `Desconectarme`, retry y `Cancelar asignación` quedan fuera de
  cualquier ScrollView; sólo el detalle de vehículo de ASSIGNED puede desplazarse.
- Offer es una superficie sin scroll con `Nueva solicitud`, countdown,
  recogida, ETA, `Aceptar` y `Rechazar`. Nombre y dirección limitan líneas
  visuales y conservan el contenido completo en accesibilidad. Error/retry vive
  en la misma zona crítica sin alterar las fences de accept/reject.
- El contrato real de Offer continúa limitado a `id`, `requestId`, `expiresAt`,
  `etaMinutes` y `pickup`. No se muestran destino, distancia, tarifa ni ganancia
  porque no existen de forma autoritativa en `DriverState`.
- La safe area se aplica una sola vez en la raíz Driver; light/dark comparten
  árbol y medidas. Mapa, Camera, fallback Atlacomulco, Passenger, backend,
  matching, lifecycle y Motion permanecen sin cambios funcionales.
- **VERIFICADO automatizado:** TypeScript, lint, focales Driver, suite completa
  **260/260**, gateway **68/68**, worklets (19 archivos), MapLibre/schema,
  splash, aislamiento fixture/release y export Hermes Android/iOS. Expo Doctor
  conserva **20/21** sólo por los cinco patches SDK 57 conocidos; no se
  actualizaron dependencias en esta rama de presentación.
- QA físico Android compacto en light/dark sigue **PENDIENTE**.

### Theme global único light/dark — 2026-10-08

- `RootProviders` resuelve exactamente un `VimaThemeProvider` productivo. Light
  continúa como default y `EXPO_PUBLIC_VIMA_THEME=dark` habilita el preview
  técnico global sólo en DEV; no existe selector, persistencia ni detección de
  horario/sistema.
- Passenger, Driver, `LiveAccountGate`, primitives y componentes compartidos
  consumen el mismo contrato tipado de roles semánticos. Se eliminó el provider
  anidado de Driver, `DriverThemeName`, `resolveDriverTheme` y
  `EXPO_PUBLIC_VIMA_DRIVER_THEME`. `VimaText` obtiene su color base directamente
  del theme activo y los componentes no ramifican por nombre de theme.
- Passenger conserva árbol, medidas, sheet heights, route-fit, Camera, motion,
  contenido e interacciones. Home, Search, reviewing/confirm, requesting,
  matching y assigned cambian únicamente superficies/colores del contrato.
  Driver conserva compact/operational, estados, critical viewport, acciones y
  Offer sin cambios funcionales.
- `VimaMap` deriva light/dark del contexto global para Passenger y Driver. El
  Positron bundled conocido usa `passengerBasemap` o `darkVimaBasemap`. Un style
  custom sigue autoritativo sin recoloring; `EXPO_PUBLIC_MAP_STYLE_DARK_URL`
  permite un style dark explícito y su ausencia conserva el custom light.
- StatusBar cambia contenido claro/oscuro desde el provider raíz. Los assets
  finales Vima no se recolorean; el lockup conserva exactamente el mismo asset
  aprobado.
- **VERIFICADO automatizado:** TypeScript, lint, suite completa **256/256**,
  gateway **68/68**, worklets (19 archivos), aislamiento fixture/release,
  splash y export Hermes Android/iOS. Expo Doctor completó **20/21** únicamente
  por los cinco patches SDK 57 conocidos; no se actualizaron dependencias en
  esta rama visual.
- Sin dependencias ni cambios nativos. QA físico Android global light/dark sigue
  pendiente en Passenger y Driver; no se declara PASS funcional de
  A→cancel→B→assigned+PIN ni retry/provenance.

### Driver UI v1 A claro + B oscuro y viewport crítico — 2026-10-08

- `DriverLiveScreen` conserva auth, query/realtime, ciclo de ubicación y
  `createDriverActions`; la presentación real vive en `src/features/driver/` y
  consume exclusivamente `DriverState`. Se retiraron `Driver P0`, accountId,
  revision, IDs y estado técnico del viewport; las trazas DEV siguen en consola.
- OFFLINE, LOCATING, AVAILABLE y PAUSED usan composición `compact`; ASSIGNED
  usa `operational`. Título, estado GPS/conectividad, error y acción crítica
  permanecen en una región no desplazable. Sólo los datos secundarios reales
  de ASSIGNED pueden usar ScrollView; `Cancelar asignación` queda fuera.
- OFFLINE muestra `Conectarme`; LOCATING muestra estado humano de señal y sólo
  el punto de ubicación puede pulsar; AVAILABLE permite dejar disponibilidad;
  PAUSED reutiliza la acción vigente de reanudación. ASSIGNED muestra pickup y
  ETA reales, sin llamada, mensaje, navegación ni fases inventadas.
- `DriverOffer` no cambió: countdown, pickup, ETA, Aceptar/Rechazar, orden,
  región crítica, target/operationId y `offer_render` se conservan.
- Theme light sigue siendo default. Dark global usa base `#0B0F0E`, surfaces
  `#121816`/`#18201D` y texto `#F6F8F7`, con las mismas keys, árbol y geometría.
  Preview oscuro únicamente en DEV mediante `EXPO_PUBLIC_VIMA_THEME=dark`;
  no hay selector ni persistencia y el mismo theme alcanza toda la app.
- Sin location se centra el mapa en el único fallback Atlacomulco compartido,
  nunca en world view. El basemap oscuro sólo recolorea el Positron bundled de
  schema conocido; un style URL explícito permanece autoritativo e intacto.
- Transiciones de contenido usan Motion v1.2 (240 ms), botones conservan press
  0.98 y Reduced Motion elimina scale/loops. El pulso de ubicación se habilita
  sólo en LOCATING; el shell y mapa permanecen montados entre estados.
- **VERIFICADO automatizado:** TypeScript, lint, suite completa, gateway
  **68/68**, worklets (19 archivos), schema MapLibre incluido dark, splash,
  aislamiento fixture/release y export Hermes Android/iOS. Expo Doctor completó
  **20/21**: la validación remota del esquema no pudo consultar `exp.host` desde
  el sandbox; no se cambiaron dependencias para ocultarlo.
- Sin dependencias ni cambios nativos. La verificación física Android de ambos
  temas y todos los estados sigue pendiente; tampoco se declara PASS el flujo
  A→cancel→B→assigned+PIN ni retry/provenance sin ejecutarlo en dos teléfonos.

### Epoch de identidad Passenger e intenciones Driver inmutables — 2026-10-08

- `adoptTripIdentity` es el único punto que cambia identidad Passenger. El
  helper request devuelve un snapshot validado sin tocar cache; `seedActiveRequest`
  queda absorbido. Request receipt, bootstrap y recuperación 409 pasan por la
  misma operación, con origen tipado. Liberar una identidad exige estado terminal.
- Cada cambio A→B/A→none incrementa un epoch síncrono, detiene explícitamente
  realtime A y cancela exactamente `tripKey(A)` antes de sembrar/exponer B y
  suscribir B. Cache histórico no se borra. Bootstrap/409/request/command/
  fetch/reconnect y callbacks realtime llevan fences; abort no es la única defensa.
  Respuestas de un epoch anterior no cambian UI, identidad ni cache vigente.
- Reconciliación estricta con contexto DEV `trip_reconcile`: origin, IDs,
  queryKey, epoch y revisions, nunca payload. Structural sharing exige el ID
  de su queryKey; command receipts, `command.tripId`. IDs distintos siguen
  fallando; snapshot/invariante v3 no cambia.
- Driver reemplaza `act(kind?, run?)` por `startDriverAction(intent)` y
  `retryPendingDriverAction()`. Pending contiene exclusivamente intent congelada
  y operationId: ref síncrona impide doble press; retry reutiliza target/ID.
  Snapshot autoritativo con otro target o error 4xx descarta pending; una oferta
  expirada no admite retry. Location automática permanece fuera del mecanismo.
- Cadena sanitizada `driver_action_press` → `driver_action_request` →
  `driver_action_http_received` → `driver_action_commit`, correlacionada por
  intent/operationId/requestId. HTTP usa el target de la URL; para offers el
  servidor obtiene requestId de su registro, sin extender el body. Retry
  idempotente puede repetir recepción HTTP, nunca un segundo commit.
- **VERIFICADO automatizado:** suite **245/245**, gateway/matching/pricing
  **68/68**; incluye A cancelada → B creada → oferta/accept reales → B assigned
  con PIN, completando después fetch/poll/bootstrap A mediante deferreds.
  TypeScript, lint, worklets, MapLibre/schema, splash, Hermes Android/iOS
  DEV/release y aislamiento vigentes. Doctor **20/21** sólo por los cinco
  patches SDK57 conocidos, sin cambios de dependencias.
- Visual Passenger/Driver, mapas, pricing, ranking, TTLs, watchdog/location y
  lifecycle post-assignment intactos. Sin cambios nativos, EAS Build ni merge.
- **PENDIENTE físico Android:** secuencia A→cancel→B→assigned con PIN incluso
  con reconexiones/respuestas tardías; cancelación Driver con los cuatro eventos
  y exactamente el mismo operationId/requestId; retry ambiguo del target original
  y ausencia de cancelación de C mediante pending B.

### Identidad Passenger activa y trazabilidad de oferta/availability — 2026-10-08

- Snapshot v3 incorpora `activeRequestByOwner` en el mismo commit que request
  e índice idempotente. Una nueva intención recibe `409 active_request_exists`
  antes de consultar otra quote si el owner ya tiene SEARCHING o ASSIGNED.
  Cancelación/NO_DRIVER_FOUND liberan el índice; asignación y reasignación de
  la misma request lo conservan. El retry original mantiene su precedencia.
- Migración v1→v2→v3 sin borrar historial: una ASSIGNED prevalece; en otro caso
  se conserva SEARCHING más antigua (`createdAt`, desempate `id`). Duplicadas
  SEARCHING pasan a CANCELLED, revocando ofertas e incrementando revisions.
  Dos ASSIGNED del mismo owner o un índice inconsistente fallan cerrados.
- GET autenticado `/v1/passenger/requests/active` devuelve snapshot o null.
  Bootstrap Passenger online bloquea crear hasta resolver; recupera identidad
  en su propio `tripKey`. Reconnect sin ID vuelve a consultar; con ID conserva
  realtime. Un 409 recupera active sin otro POST ni éxito optimista. Una
  identidad distinta de una local no terminal se rechaza; null no la borra.
  `reconcileTrip` conserva estrictamente su rechazo entre IDs diferentes.
- Trazas sanitizadas inyectables server: `request_active`, `request_terminal`,
  `offer_commit`, `driver_state_offer`, `availability_transition`. Poll añade
  stream/entity conservando pollId y coalescing. DEV `offer_render` se emite
  al cambiar identidad/revision/expiración, nunca por cada tick del countdown.
- Driver usa operationIds tipados y conserva el mismo ID ante retry ambiguo.
  Las transiciones de disponibilidad pasan por provenance tipada: únicamente
  `explicit_offline` puede llevar a OFFLINE. TTL conserva LOCATING; expiración
  conserva PAUSED; background/unmount no escribe disponibilidad.
- La región crítica de oferta muestra countdown, pickup, ETA y Aceptar/Rechazar
  fuera de ScrollView, antes de cualquier contenido técnico. No añade datos ni
  UI Driver A/B. Oferta vencida deja ambos botones no accionables.
- **Automatizado:** cobertura de índice/migración/restart/carreras, bootstrap,
  409, cancel→nuevo ID, ownership, trazas/provenance y render sin scroll.
  TypeScript, lint, suite completa **238/238**, gateway/matching/pricing
  **67/67**, worklets,
  MapLibre/schema, splash, Hermes DEV/release Android/iOS y aislamiento.
  Expo Doctor **20/21** únicamente por cinco patches SDK57 conocidos, sin
  actualizar dependencias. Sin cambios nativos ni EAS Build.
- **PENDIENTE físico Android:** recuperar Passenger tras reinicio, impedir
  segunda activa y cancelar→crear limpia; oferta visible durante ~20 s y cadena
  offer_commit→poll_invalidation→driver_state_offer→offer_render; Driver quieto
  AVAILABLE >60 s, y OFFLINE sólo al pulsar Desconectarme con provenance.
  Watchdog/location, TTLs, ranking ETA, pricing y visual Passenger intactos.

### Watchdog Driver limitado al primer fix nativo — 2026-10-08

- La validación física confirmó permiso, sesión lógica, realtime y la transición
  LOCATING→AVAILABLE. El error restante era un false watchdog: cada callback
  válido volvía a armar el timeout aunque `distanceInterval: 10` no obligaba a
  un Driver quieto a emitir otra muestra dentro de 10 s.
- Cada nueva `watchGeneration` arma ahora un único watchdog de bootstrap al
  completar `watch_attached`. Sólo su primer callback nativo válido lo cancela
  definitivamente; callbacks posteriores continúan sus POST sin watchdog,
  retry o reattach. Una muestra inválida y una last-known fresca no satisfacen
  ese primer fix nativo. Un watcher que no entrega ninguna muestra válida sigue
  retirándose a los 10 s y recuperándose mediante el retry único de 3 s.
- El watcher foreground conserva Balanced accuracy y usa ahora
  `timeInterval: 5000` con `distanceInterval: 0`, para renovar `receivedAt`
  también cuando el Driver está estacionario. Error nativo, background y
  foreground conservan la recuperación aprobada: cada generación nueva obtiene
  su propio watchdog bootstrap y una generación obsoleta no puede afectarla.
- **VERIFICADO automatizado:** TypeScript, lint, suite **221/221**, gateway/
  matching/pricing, worklets, schema/style MapLibre, splash, Hermes DEV/release
  Android/iOS y aislamiento de fixtures, servidor, credenciales, trazas y paths.
  Expo Doctor conserva **20/21** sólo por los cinco patches SDK 57 conocidos;
  no se actualizaron dependencias. Sin cambio nativo: no requiere Development
  Build nuevo.
- **PENDIENTE físico:** mantener un Driver quieto más de 60 s y comprobar que
  permanece AVAILABLE, `receivedAt` se renueva, no aparece «Sin señal…», no se
  emiten `watchdog`/`watch_retry`, existe un solo watcher y un watcher realmente
  sin primera muestra sigue recuperándose.

### Lifecycle Driver estable y hit testing detached — 2026-10-08

- La sesión lógica de ubicación Driver depende de `tracksLocation && focused` y
  sobrevive LOCATING→AVAILABLE, el prompt de permiso y background/foreground.
  `foreground` gobierna únicamente provider/watcher/watchdog/retry nativos: al
  salir se retiran y al volver se revalida provider antes de adjuntar exactamente
  un watcher. Stop lógico queda reservado para unmount, pérdida de foco, cambio
  de availability o de cuenta/cliente; POST en curso y generaciones tardías se
  abortan/ignoran como antes.
- Antes de solicitar permiso se consulta `getForegroundPermissionsAsync`. El
  prompt abre una fase explícita antes de la llamada nativa y sólo la cierra
  cuando la solicitud resolvió y volvió foreground real, si el prompt lo perdió.
  Sus transiciones AppState no destruyen sesión ni long-poll; un background
  normal posterior sí pausa watcher y cancela realtime, y foreground crea uno
  nuevo de cada tipo sin duplicados.
- Las trazas DEV añaden `permission_check`, `location_gate` con motivos
  `not_foreground`, `permission_prompt`, `provider_disabled` y
  `tracking_allowed`; `location_session_stop` y `poll_stop` incluyen motivo de
  lifecycle. Siguen sanitizadas y ausentes de release.
- `VimaRideSheet` incorpora política explícita `sheet | content-only`, con
  `sheet` como default. Sólo los paneles Passenger detached usan `content-only`:
  outer, viewport, presence, viewport Passenger, ScrollView y slot estructural
  del header dejan pasar toques en regiones transparentes; header, buscador,
  contenido, filas, botones e inputs conservan interacción. `MapViewportClip`
  mantiene `overflow: hidden`; no cambiaron offsets, snaps ni mediciones.
- **VERIFICADO automatizado:** TypeScript, lint, suite **220/220**, gateway/
  matching/pricing **57/57**, worklets (19 archivos), schema/style MapLibre,
  splash, export DEV y compilación Hermes DEV Android/iOS, export Hermes release
  Android/iOS y aislamiento de fixtures, servidor, credenciales, trazas y paths.
  Expo Doctor queda en **20/21** sólo por los mismos cinco patches SDK 57; no se
  actualizaron dependencias. Sin cambio nativo: no requiere nuevo Development
  Build.
- **PENDIENTE físico Driver:** completar en un Android real la cadena permiso →
  provider → watcher → callback → POST AVAILABLE; comprobar mismo session/poll
  durante prompt, un watcher/poll tras background real y oferta Passenger.
- **PENDIENTE físico mapa Passenger:** en Home y Search iniciar pan desde todas
  las regiones visualmente libres, incluida la zona inferior sin CTA, y confirmar
  que input, quick places, resultados, scroll y botones siguen recibiendo toques.

### Observabilidad Driver location y coalescing realtime — 2026-10-07

- Driver location emite en DEV trazas estructuradas con `locationSessionId` para
  permiso, provider, last-known, attach/callback/error/watchdog/retry, POST y
  cierre. Los campos quedan limitados a IDs, booleanos, frescura, availability,
  revision, status/code sanitizado y duración; no se registran coordenadas,
  heading, credenciales, perfiles, payloads ni URLs. El logger queda inerte con
  `__DEV__ === false` y su marcador se comprueba ausente del bundle release.
- La sesión usa `getProviderStatusAsync` y el error handler real, tercer
  argumento de `watchPositionAsync` en Expo Location SDK 57. Servicios/provider
  deshabilitados mantienen LOCATING, muestran error recuperable y usan el retry
  controlado existente sin POST. Error async y watchdog invalidan la generación
  anterior, retiran la subscription y comparten la misma ruta de retry.
- Una generación identifica al watcher vigente: existe como máximo una
  subscription, un watchdog y un retry. Un error/callback tardío de una
  generación retirada no puede afectar al reemplazo; stop invalida callbacks,
  aborta el POST en curso y limpia subscription/timers. LOCATING→AVAILABLE sigue
  usando la misma sesión foreground.
- Cada long-poll lleva `pollId` y trazas DEV de inicio/resultado/error/retry/
  reconciliación/fin. Tras reconectar, revision nueva produce sólo invalidación;
  sin revision nueva produce sólo callback de reconexión. Nunca se ejecutan
  ambas reconciliaciones para el mismo resultado y cada subscription conserva
  un único poll secuencial. GET continúa siendo la autoridad.
- **VERIFICADO automatizado:** TypeScript y lint; suite **214/214**; gateway/
  matching/pricing **56/56**; worklets (19 archivos), splash, export nativo DEV
  Android/iOS, Hermes release Android/iOS y aislamiento de fixtures, servidor,
  secretos, trazas DEV y paths. Expo Doctor queda en **20/21** sólo por los
  mismos cinco patches SDK 57; no se actualizaron dependencias. Cambio JS/TS y
  documentos, sin dependencia ni módulo nativo nuevo: no requiere Development
  Build.
- **PENDIENTE físico:** reunir la cadena `permission_result granted` →
  `provider_result enabled` → `watch_attached` → `watch_callback` →
  `location_post_start` → `location_post_receipt AVAILABLE`, confirmar después
  GET Driver AVAILABLE con location, mapa centrado y oferta desde Passenger
  SEARCHING. Repetir con GPS off/on, background/foreground, watchdog y pérdida/
  reconexión de red; no se marca PASS hasta completar esa evidencia.

### Bootstrap Driver location → availability → matching — 2026-10-07

- Driver añade el estado autoritativo `LOCATING`. La intención AVAILABLE queda
  LOCATING sin muestra fresca y cambia a AVAILABLE en el mismo commit que
  persiste una ubicación real válida. Sólo AVAILABLE con location de menos de
  60 s entra al ranking; no existen coordenadas por defecto ni éxito optimista.
- La última muestra vive únicamente en `DriverRecord`. Snapshot schema v2
  conserva coordinate, heading opcional, receivedAt y locationRevision; una
  migración v1 determinista convierte AVAILABLE sin location a LOCATING,
  revoca ofertas incompatibles y preserva requests, assignments e idempotencia.
  Estados v1 realmente inválidos siguen fallando cerrados.
- El scheduler agenda exactamente `receivedAt + 60 s`. Al vencer cambia
  AVAILABLE→LOCATING, aumenta revision, revoca oferta ACTIVE y despierta la
  búsqueda sin volver a ofrecer ese Driver a la misma request. OFFLINE, PAUSED
  y ASSIGNED permanecen intactos; cancel assignment decide AVAILABLE/LOCATING
  con la frescura actual y conserva la regla de tres expiraciones→PAUSED.
- Driver DEV sustituyó el polling `getCurrentPositionAsync` por una sesión
  foreground `watchPositionAsync`, activa sólo en LOCATING/AVAILABLE con foco y
  app activa. Last-known se envía únicamente si es válida y <60 s; watchdog de
  10 s limpia y recrea tras 3 s. Blur/background/cambio de estado/unmount
  cancelan subscription, timers y requests. La UI muestra «Localizando…».
- **VERIFICADO automatizado:** TypeScript y lint; suite **204/204**; gateway/
  matching/pricing **54/54**; regresión focal **28/28**; worklets, MapLibre/schema
  (suite), splash, Hermes Android/iOS DEV y release, aislamiento de fixtures,
  servidor, credenciales y paths. Expo Doctor queda en **20/21** exclusivamente
  por los mismos cinco patches SDK 57; no se actualizaron dependencias.
  Cambio sólo JS/TS y documentos: no requiere nuevo Development Build.
- **PENDIENTE físico:** en Driver pulsar Disponible y comprobar LOCATING→
  AVAILABLE con coordinate/receivedAt reales, mapa centrado y oferta al crear
  una request Passenger SEARCHING. También validar permiso lento/denegado,
  watchdog, background/foreground, TTL y restart en dos dispositivos.

### Crash Android `Missing approved text: body` — 2026-10-07

- El gate live Passenger montaba `VimaText variant="body"`; esa variante sólo
  pertenece al API interno `textStyle` y no existe en el theme público. El prop
  aceptaba cualquier `string`, por lo que TypeScript no detectó el error y el
  guard runtime detuvo el arranque.
- Los tres callsites del gate y los siete del Driver DEV usan ahora
  `bodyRegular`, conservando el peso visual regular. No se cambió layout, diseño,
  Motion, mapa, gateway, matching ni lógica funcional.
- `VimaTextVariant` deriva de `keyof typeof lightTheme.text`; `body` falla ahora
  en TypeScript. `VimaSurfaceVariant` se cerró igualmente sobre
  `keyof typeof lightTheme.surfaces`, ya que todos sus callsites son estáticos y
  aprobados y no requirió refactor adicional.
- **VERIFICADO automatizado:** TypeScript, lint, suite **195/195**, gateway/
  matching **48/48**, worklets y Hermes Android/iOS pasan. Las siete variantes
  públicas renderizan, el estado inicial de `LiveAccountGate` Passenger monta
  sin la excepción y el bundle DEV compila para Android/iOS. La
  cobertura type-level usa `@ts-expect-error` para impedir que `body` vuelva al
  API público. Aislamiento release/fixtures/credenciales/paths y splash pasan.
  Expo Doctor conserva **20/21** sólo por los cinco patches SDK 57 conocidos;
  no se actualizaron dependencias. Android físico Home y Search → reviewing
  siguen **PENDIENTES**. Cambio sólo JS/TS; no requiere nuevo Development Build.

### Request/matching autoritativo y Driver DEV mínimo — 2026-10-07

- Request real con quote owned/priced congelada, cancelación pre-assignment,
  ofertas de 20 s a grupos de hasta dos Drivers por ETA real, assignment y
  cancelación Driver que vuelve a búsqueda sobre la misma request/deadline.
  Un coordinador serializa commits; TomTom corre fuera del lock y sus resultados
  se revalidan. No se implementó lifecycle posterior al assignment.
- Auth externa `VIMA_AUTH_CONFIG_PATH`, role/ownership por endpoint, tokens
  comparados sin loguearlos. Gate técnico DEV guarda/cambia/limpia el token en
  SecureStore. Se mantiene el rechazo de bearer sobre HTTP.
- Snapshot versionado `.runtime/matching-v1.json`, temporal + fsync + rename,
  idempotencia/revisions duraderas y recuperación de expiraciones. Corrupción
  falla cerrada. No se persisten bearer ni perfiles reconstruibles.
- Passenger live conserva shell/draft/quote y usa request/fetch/execute reales,
  RealtimeTransport de invalidaciones + Query/reconcile. 60/120 son hitos UI
  locales; NO_DRIVER_FOUND usa expired. Cancelación después de assigned queda
  deshabilitada. Driver `/dev/driver` reutiliza DriverRideShell/primitivas con
  disponibilidad, ubicación foreground, offer Accept/Reject y Cancelar asignación.
- Recuperación de create ambiguo conserva quote e ID originales aunque se
  renueve la query; Back no abandona ese intento sin reconciliar. Un rechazo
  definitivo libera el intento. No hay éxito optimista de request/comandos.
- **VERIFICADO automatizado:** TypeScript, lint, suite **194/194**, gateway/
  pricing/matching **48/48** (20 tests nuevos contando la recuperación renderizada
  de Passenger), carreras/restart y E2E HTTP con rutas y pricing sintéticos.
  Worklets, schema/style MapLibre (suite), Hermes release Android/iOS, splash,
  fixture/release/server/credential/path isolation y `git diff --check` pasan.
  Expo Doctor **20/21**: únicamente los cinco patches SDK 57 conocidos; sin
  actualizar dependencias. Warnings existentes de Node typeless y renderer
  de tests no bloquean las pruebas.
- Export DEV Android/iOS con Driver/gate incluido y fixture isolation correcto.
  Scan adicional de configuración/credenciales server-only ausentes pasa en DEV.
  Aplicar también `check-mobile-boundary` a DEV detecta el header público
  `TomTom-Api-Key` de Orbis Display ya existente en `VimaMap`, no una key secreta
  ni código matching del servidor. Se conserva el check sin relajar y pasa en
  release; no se modificó Map Display/Traffic para ocultar ese resultado.
- **PENDIENTE físico y TomTom E2E live:** no hay HTTPS físico ni dos dispositivos
  disponibles en esta sesión; tampoco configuración auth/pricing/key en el
  entorno servidor. No se afirma PASS físico. Runbook, endpoints y escenarios:
  [MATCHING_P0.md](MATCHING_P0.md). Sin dependencias ni cambios nativos.

### Origen único y offsets fraccionarios del sheet — 2026-10-06

- Home y Search conservan el punto azul de ubicación actual. Al entrar en
  reviewing y estados posteriores, el origen visible prefiere el draft actual
  sobre la quote. Si el pin verde y el punto azul comparten exactamente las
  coordenadas, sólo se monta el pin verde; si las posiciones difieren, ambos
  permanecen visibles. Una quote nueva o renovada del mismo draft no cambia
  la identidad del marker ni reinicia su entrada; editar realmente la posición
  del origen sí puede ejecutar la entrada aprobada.
- `allowedSheetGeometry` acepta exclusivamente diferencias de redondeo
  IEEE-754, con tolerancia proporcional a la magnitud y derivada de
  `Number.EPSILON`. Canonicaliza límites y target a offsets permitidos exactos,
  sin ampliar los bounds devueltos. Valores no finitos, listas vacías, offsets
  fuera de rango y targets sin offset permitido continúan rechazándose.
- Pruebas automatizadas cubren las transiciones de markers, quote y alturas
  fraccionarias del sheet. **Android físico PENDIENTE** de revalidar Search →
  reviewing, llegada/renovación de quote y edición repetida de destino con
  teclado/cambios de altura. Camera, route-fit, Motion 1.2 y geometría funcional
  del sheet no cambiaron. Sin cambio nativo ni EAS Build.
- TypeScript, lint, suite 174/174, gateway 29/29, worklets, schema/style
  MapLibre, splash, Hermes Android/iOS y aislamiento de fixtures/release/
  credenciales pasaron. Expo Doctor queda en 20/21 sólo por los cinco patches
  SDK 57 conocidos; no se actualizaron dependencias.

### Mediciones Passenger sin remount visible — 2026-10-06

- Tras eliminar el doble árbol con `PassengerScenePresence`, Android aún mostró
  un parpadeo residual: `measureKey` seguía siendo la `key` React del header y
  viewport. Ambos nodos visibles se desmontaban al cambiar fase, quote, lugares
  o geometría de ruta.
- Header, viewport y contenido ahora conservan identidad React. `measureKey`
  sólo identifica la generación lógica de header/content/viewport y del alto
  visible del sheet. Las últimas alturas físicas mantienen continuidad mientras
  se reciben nuevas medidas; una lectura nativa tras layout revalida también
  dimensiones idénticas que no vuelven a emitir `onLayout`. Callbacks anteriores
  a la generación vigente se descartan. `settledSheetHeight` y route-fit sólo
  aceptan las tres medidas validadas para la generación actual.
- Permanecen intactos `PassengerScenePresence`, Motion 1.2 interno, geometría
  final del sheet, Camera, route-fit, Search y mapa. **Android físico PENDIENTE**
  de repetir Search → reviewing, confirm → Home y llegada/renovación de quote,
  incluidos cambios rápidos. Sin dependencias, cambio nativo ni EAS Build.
- Validación: TypeScript, lint, suite 171/171, gateway 29/29, worklets,
  schema/style MapLibre, splash, Hermes Android/iOS y aislamiento de
  fixtures/release/credenciales pasaron. Expo Doctor 20/21 conserva sólo los
  cinco patches SDK 57 conocidos; no se actualizaron dependencias.

### Transición estable entre escenas Passenger — 2026-10-06

- En Android físico se observó un flash blanco en Search → reviewing y un ghost
  de dos escenas en confirm → Home. La causa era el `ElementEntrance` exterior
  con `key={scene}` y `exiting`: retenía el árbol anterior mientras el nuevo
  empezaba con opacidad cero.
- `PassengerScenePresence` mantiene un único wrapper y un único árbol de escena.
  Reemplaza el contenido sin salida retenida y aplica una sola entrada
  interrumpible de 12 dp y 240 ms, o 300 ms para matching/assigned, con el
  easing Motion 1.2 existente. Su opacidad mínima es 0.8; otro cambio cancela
  la animación anterior y continúa desde el progreso en curso. Reduced Motion
  mantiene sólo el fade, sin desplazamiento. Las entradas internas siguen
  usando `ElementEntrance`.
- En esa ronda `measureKey` aún remontaba el viewport; la corrección de
  mediciones anterior lo separó de la identidad React visible. No se alteraron
  sheet, mapa, Camera, route-fit, lógica ni tokens Motion.
  **Android físico PENDIENTE** de repetir específicamente Search → reviewing y
  confirm → Home, también con cambios rápidos y Reduced Motion. Sin cambio
  nativo ni EAS Build.
- Validación: TypeScript, lint, suite 169/169, gateway 29/29, worklets,
  splash, schema/style MapLibre, export Hermes Android/iOS y aislamiento de
  fixtures/release/credenciales pasaron. Expo Doctor 20/21 conserva únicamente
  los cinco patches SDK 57 conocidos; no se actualizaron dependencias.

### Cierre estable del menú Capas — 2026-10-06

- `MapControls` conserva Tráfico e Incidentes en una sola superficie de altura
  medida por layout. Un slot animado y anclado al botón Capas colapsa su altura
  y ambos gaps junto con el fade; el menú no entra al reflow del stack.
  La brújula acompaña ese colapso y el botón Capas permanece fijo.
- El glyph X se conserva hasta la finalización del cierre. Un nuevo tap cancela
  el progreso previo y descarta callbacks de cierres obsoletos; al cerrar por
  completo, el menú deja de recibir toques y se oculta a accesibilidad. Reduced
  Motion mantiene el fade y elimina el translate decorativo. No hay timers ni
  cambios en tokens, switches, haptics, Camera, route-fit o geometría del shell.
- Android físico sigue PENDIENTE de comprobar diez ciclos de apertura/cierre,
  interrupción rápida y Reduced Motion. No se realizó EAS Build ni hubo cambios
  nativos.
- Validación: TypeScript, lint, suite 167/167, gateway 28/28, worklets, splash,
  Hermes Android/iOS, aislamiento de fixtures/release y límite de credenciales
  pasaron. Expo Doctor quedó en 20/21 por los mismos cinco patches SDK 57.

### Pricing comercial Atlacomulco y efectivo live — 2026-10-06

- El archivo operativo real `.runtime/pricing/atlacomulco-p0.json` queda
  ignorado por Git y se carga sólo mediante `VIMA_PRICING_CONFIG_PATH` en el
  gateway. Contiene la versión `atlacomulco-p0-20261006-v1`, perfiles URBANO y
  REGIONAL, MXN, TTL 300 s y redondeo final half-up a $1. No se versionaron
  tarifas comerciales, polígonos ni credenciales. La configuración inválida
  sigue fallando cerrada.
- La única región configurada proviene de [INEGI Marco Geoestadístico 2025,
  `Municipios_2025/00mun`](https://lcidsig.inegi.org.mx/server/rest/services/Hosted/Municipios_2025/FeatureServer/0),
  `cvegeo=15014`, `nomgeo=Atlacomulco`, con salida confirmada EPSG:4326. El servicio
  devolvió un Polygon de un solo anillo cerrado y 1304 vértices, sin
  simplificación; `validatePricingConfig` aceptó su geometría. Plaza Atlacomulco
  y CU UAEM Atlacomulco quedan dentro; un destino fuera de esa única región
  conserva `pricing_unavailable`. REGIONAL live espera polígonos municipales
  vecinos aprobados, sin regiones ficticias.
- El Passenger live gateway declara `paymentReady=true` y presenta `Efectivo`
  en la quote. `tripRequestAvailable=false` mantiene `canRequest=false` aun
  con una quote priced. El importe visible continúa derivándose del precio
  autoritativo de `/v1/passenger/quotes`; no se añadió request/matching.
  Startup sólo registra `pricingStatus` y, si está ready, `pricingVersion`, sin
  exponer config, polígono ni credencial. Se observó startup `pricingStatus=ready`
  con la versión aprobada.
- **PRIMER QUOTE LIVE: PASS.** Con la clave de servidor suministrada fuera de
  Git, se ejecutó el cliente Passenger contra el gateway local, TomTom Routing
  real y PricingEngine para Plaza Atlacomulco → CU UAEM Atlacomulco. Resultado:
  `status=priced`, `profile=URBANO`, versión aprobada, ruta real de 196 puntos,
  8562 m, 989 s efectivos con tráfico, MXN, `totalMinor=11300`, extras vacíos y
  sin override. La fórmula independiente sobre esas métricas dio 11322.1 minor
  antes de redondear y 11300 minor después de half-up a 100. `paymentReady=true`,
  `paymentMethod=Efectivo`, `tripRequestAvailable=false`, `canRequest=false`.
  El script de comprobación en `.runtime/pricing/verify-live.mjs` y las claves
  suministradas permanecen fuera del commit.
- **ANDROID LIVE QUOTE: PENDIENTE.** No se recorrió el flujo en un dispositivo
  físico. Para repetirlo: configurar `TOMTOM_API_KEY` sólo en el gateway y
  `VIMA_PRICING_CONFIG_PATH=.runtime/pricing/atlacomulco-p0.json`, arrancar
  `npm run geo:gateway` y apuntar `EXPO_PUBLIC_VIMA_API_BASE_URL` desde el
  Development Build al gateway accesible en la red local. Verificar importe,
  Efectivo, ruta/distancia/duración y CTA deshabilitado por request no disponible.
- Comisión beta 10% y propina fuera de comisión están aprobadas como política,
  pero settlement/payout y su interacción con futuras casetas/extras NO ESTÁN
  IMPLEMENTADOS. No afectan el PricingEngine ni el precio Passenger actual.
- TypeScript, lint, suite completa (168/168), gateway/pricing (29/29), worklets,
  splash, schema MapLibre, export Hermes Android/iOS y checks de aislamiento de
  fixtures/release/paths/credenciales pasaron. Expo Doctor quedó en 20/21 sólo
  por los cinco patches SDK 57 conocidos; no se actualizaron dependencias ni
  se hizo EAS Build.

### Motion 1.2 Passenger — 2026-10-06

- El JSON aprobado de Motion 1.2 conserva easings, política sin springs, SearchCycle
  de 1900 ms, mapa de 420 ms, SearchPulse y haptics. Instant baja a 110 ms;
  feedback dura 180 ms, stagger 28 ms y press llega a 0.97 con salida de 160 ms.
  Las entradas nuevas de Search usan 9 dp/180 ms hasta cinco ítems; la escena
  usa 12 dp con 240 ms o 300 ms en matching/assigned. El settle del pin se
  deriva del total de mapa para conservar sus 420 ms.
- Los controles Passenger usan una sola respuesta de scale por Pressable activo.
  Search interpola el borde verde a verde oscuro y eleva el halo al ganar foco
  durante 160 ms. Un registro de identidades (canonicalId o id) evita reentradas
  por detalles tardíos y rerenders; las colecciones existentes conservan press
  sin entradas repetitivas.
- VimaButton mantiene el mismo frame al cambiar enabled/disabled o
  label/icon/spinner. El wash y la opacidad de estado transicionan en 180 ms;
  loading conserva un indicador visible también con Reduced Motion. El bottom
  nav conserva altura y disponibilidad, con press 0.97, wash y color de estado
  preparado para una transición de 180 ms. Reduced Motion elimina scale,
  desplazamiento y stagger, pero conserva fades funcionales.
- La geometría del mapa, Camera, route-fit, medidas del sheet, snaps, composición, lógica de viaje,
  pricing, routing, matching y persistencia no cambiaron. Android físico sigue
  PENDIENTE de comprobar; no se realizó EAS Build ni hubo cambios nativos.
- Validación: TypeScript, lint, suite 167/167, gateway 28/28, worklets, splash,
  Hermes Android/iOS, aislamiento de fixtures y release, límites de credenciales
  en ambos bundles y schema MapLibre pasaron. Expo Doctor quedó en 20/21 sólo
  por los cinco patches SDK 57 ya conocidos; no se actualizaron dependencias.

### Direcciones integradas al panel Passenger — 2026-10-06

- En reviewing, confirm y requesting, el bloque único de Origen/paradas/Destino
  ocupa el primer lugar del contenido del panel blanco. Conserva borde y halo
  únicos, filas embedded, colores de pines, edición, taps y disabled. Las paradas
  de la cotización también se muestran deshabilitadas en reviewing, entre Origen
  y Destino.
- Se retiraron el accesorio flotante de direcciones y su gap. Home y Search
  conservan sus superficies detached; los tres estados de direcciones usan el
  sheet normal con radio superior 40 dp, inferior 0 y fondo continuo. La altura
  se deriva de las mismas mediciones de header y content, ahora con el bloque
  dentro de content. No cambiaron snaps, route-fit, Camera ni geometría del mapa.
- TypeScript, lint, 163 pruebas, 28 pruebas de gateway, worklets, schema de
  MapLibre, splash, export Hermes Android/iOS y checks de aislamiento de
  fixtures, servidor, credenciales y paths/release pasaron. Expo Doctor queda
  en 20/21 por los mismos cinco patches pendientes de SDK 57; no se actualizaron
  dependencias.
- La comprobación visual en Android físico sigue PENDIENTE; esta ronda no incluye
  cambios nativos ni EAS Build.

### Home/Search integrados, accesos con color y basemap más vivo — 2026-10-06

- En Home, `¿A dónde vamos?` vuelve al interior del mismo panel blanco, después del
  handle: ancho de panel, alineación izquierda y alto 58 dp. Conserva su borde,
  halo y press Motion 1.1. En Search normal de destino hay un solo input, dentro
  del panel después del handle; se eliminó el título flotante de Search. El
  background absoluto/full-height mantiene radio superior 40 dp e inferior 0,
  sin seam. Home conserva panel del 50% de `sheetFrameHeight`; su footprint real
  incluye ahora el buscador interior, y controles/recenter usan la medida del
  sheet sin compensación del antiguo accessory de 68 dp.
- Casa, Trabajo y Favoritos conservan fila y targets de 44 dp; tienen washes
  semánticos verde, azul y rojo suave con iconos del mismo color. En la
  configuración de Casa/Trabajo, `Usar mi ubicación actual` utiliza el lugar
  localizado con dirección o el Reverse existente si falta dirección, y guarda
  por la misma operación `saveSavedSlot`. Si la ubicación carga o no está
  disponible, la acción se desactiva y Search/map selection continúan accesibles.
  No cambió la persistencia ni el comportamiento de Favoritos/Recientes.
- La brújula conserva botón 44×44, columna, bearing, reset al norte, fade 160 ms,
  press y Reduced Motion. Su símbolo usa una aguja de punta norte blanca con
  contorno graphite y punta opuesta graphite. El lockup master Vima pasa de
  32 a 35 dp, mantiene proporción y anclaje `safeAreaTop + 14`/left 16, sin
  fondo; el botón de notificaciones no se movió.
- Sólo el `passengerBasemap` local aumenta visibilidad de `park`, `landcover`
  wood/grass/farmland/wetland y `landuse` recreativo con los filtros reales ya
  verificados de OpenMapTiles. Agua y cauces usan azul más visible; vías path,
  minor y major separan mejor su jerarquía. Source, geometría, labels, RouteLayer,
  Traffic, pins, Camera y estilos custom/productivos no cambiaron. La fidelidad
  de tiles en Atlacomulco todavía necesita Android físico.
- La capa de miniaturas y su catálogo versionable permanecen listos para fotos
  con derechos verificables. No se añadió ninguna foto: la revisión de Plaza
  Atlacomulco y CU UAEM Atlacomulco halló páginas del titular con imágenes,
  pero no una licencia reutilizable explícita. El fallback por categoría sigue
  siendo el resultado real; ver `PLACE_MEDIA_P0.md`.
- Validación: TypeScript, lint, 163 tests, gateway 28 tests, worklets, schema
  MapLibre, splash, Hermes Android/iOS y checks de fixtures, servidor,
  credenciales y paths/release pasaron. Expo Doctor 20/21 señala sólo los cinco
  patches SDK 57 ya conocidos; dependencias intactas. Sin cambios nativos ni
  EAS Build. Android físico sigue PENDIENTE.

### Cierre visual aprobado Home/Search/Confirmación: brújula — 2026-10-06

- El control `MapCompass` usa el glyph `explore` de Material Symbols
  (`U+E87A`), una rosa de los vientos presente en la fuente incluida, en
  lugar de la flecha `navigation` (`U+E55D`). Sigue encima de Capas en la
  columna derecha. Tamaño, superficie, color, bearing, acción al norte,
  visibilidad, fade, press y Reduced Motion no cambiaron.
- El cierre visual de código de Home, Search y Confirmación conserva los
  layouts aprobados. Android físico sigue PENDIENTE de comprobación; no se
  generó EAS Build ni hubo cambios nativos.
- Validación local: TypeScript, lint, 161 tests, worklets, schema MapLibre,
  Hermes Android/iOS, splash y aislamiento de fixtures, servidor, rutas,
  credenciales y release correctos. Expo Doctor pasó 20/21 únicamente por
  los mismos cinco patches pendientes del SDK 57; no se actualizaron
  dependencias.

### Radio superior Passenger de 40 dp — 2026-10-06

- Home, Search, reviewing, confirm y requesting usan radio superior de 40 dp;
  las esquinas inferiores detached siguen en 0 dp. Se conserva la superficie
  absoluta de altura `sheetFrameHeight` detrás de header y content, sin seam.
- No cambiaron Home search, alturas, snaps, mediciones, route-fit, Camera,
  Motion 1.1 ni lógica. Sin dependencias o cambios nativos; Android físico
  PENDIENTE. No se generó EAS Build.
- Validación local: TypeScript, lint, 161 tests, worklets, schema MapLibre,
  Hermes Android/iOS, splash y aislamiento de fixtures, servidor, rutas,
  credenciales y release correctos. Expo Doctor pasó 20/21 únicamente por
  los cinco patches pendientes del SDK 57; no se actualizaron dependencias.

### Radio 64 y buscador Home compacto — 2026-10-06

- El radio superior Passenger es 64 dp en Home, Search, reviewing, confirm y
  requesting; las esquinas inferiores detached siguen en 0 dp. La superficie
  blanca absoluta de altura `sheetFrameHeight` continúa detrás del header y
  contenido, fuera de los accessories y sin participar en layout o touches.
- Sólo en Home, el buscador de 58 dp toma el ancho de su contenido: frame
  centrado sin stretch, pill sin ancho `100%`, padding horizontal 24 dp por
  lado, glyph 21 dp en frame 24 × 24, gap 10 dp y texto `bodyMedium`. El halo
  absolute-fill y el press escalan junto al frame compacto, centrados.
- Home 50%, gap, medidas, snaps, route-fit, Camera, Motion 1.1 y lógica
  permanecen intactos. Sin dependencias ni cambios nativos; Android físico
  PENDIENTE. No se generó EAS Build.
- Validación local: TypeScript, lint, 161 tests, worklets, schema MapLibre,
  Hermes Android/iOS, splash y aislamiento de fixtures, servidor, rutas,
  credenciales y release correctos. Expo Doctor pasó 20/21: sólo señala las
  mismas cinco versiones patch pendientes del SDK 57; no se actualizaron
  dependencias en esta rama.

### Superficie continua detached y buscador Home centrado — 2026-10-06

- En Home, Search de destino con resultados, reviewing, confirm y requesting,
  el radio superior visible de 120 dp lo dibuja una superficie blanca absoluta
  que nace dentro del panel, después del accessory y su gap. Usa el
  `sheetFrameHeight` existente para continuar detrás de header y contenido;
  no participa en layout ni intercepta touches. Las esquinas inferiores son
  rectas (0 dp). Header y viewport ya no pintan blanco opaco propio; el
  viewport conserva `overflow: hidden` para su contenido.
- Los estados no detached conservan el radio de 120 dp en el sheet real. El
  grupo lupa + texto del buscador Home queda centrado horizontalmente dentro
  del pill de 58 dp, sin offsets; se mantienen glyph 21/24 dp, gap 10 dp,
  `bodyMedium`, halo y press.
- La tubería de medidas, Home 50%, snaps, route-fit, Camera, Motion 1.1 y
  lógica permanecen intactos. Sin dependencias ni cambios nativos. Android
  físico PENDIENTE; no se generó EAS Build.
- Validación local: TypeScript, lint, 161 tests, worklets, schema MapLibre,
  export Hermes Android/iOS, splash y aislamiento de fixtures, servidor,
  credenciales, rutas y release correctos. Expo Doctor pasó 20/21: su check
  remoto de versiones patch del SDK 57 pide actualizar `expo`,
  `expo-constants`, `expo-linking`, `expo-router` y `expo-sqlite`. Se deja
  pendiente por estar fuera del alcance sin cambios de dependencias.

### Esquinas de los paneles Passenger — 2026-10-06

- Home, Search, reviewing, confirm y requesting usan radio de 120 dp sólo en
  las dos esquinas superiores de la superficie blanca principal. El contenido
  del panel detached conserva `overflow: hidden` y tiene ambos radios
  inferiores en 0 dp; header y contenido siguen continuos y blancos.
- No cambiaron alturas, snaps, mediciones, layout, route-fit, Camera, motion,
  accessories, bottom nav ni lógica. Sin dependencias o cambios nativos.
  Android físico PENDIENTE; no se generó EAS Build.
- Validación local: TypeScript, lint, 161 tests, worklets, Expo Doctor 21/21,
  schema MapLibre, export Hermes Android/iOS, splash y aislamiento de fixtures,
  pricing/servidor, rutas y credenciales de release, todos correctos.

### Alineación Home, halo de direcciones y nav compacto — 2026-10-06

- Home conserva el buscador de 58 dp, su posición, borde, halo, copy y Motion.
  La lupa de 21 dp queda centrada en un frame de 24 × 24 dp; el texto sigue en
  `bodyMedium`, sin desplazamientos verticales manuales. El gap interno es 10 dp.
- Reviewing, confirm y requesting conservan una sola card exterior para Origen,
  paradas y Destino. Un halo absoluto estático queda detrás de esa card, con
  radio compartido, sombra verde blur 16/spread 4 y opacity 0.18. No ocupa
  layout, no añade halo por fila ni ciclo de animación.
- Bottom nav usa altura real `6 + 48 + max(10, bottomInset)` dp (64 dp de base),
  tabs de 48 dp, gap icono/label de 2 dp y safe-area inferior. Inicio activo usa
  `greenDark` (#00826F); tabs inactivas siguen graphite. Handlers, disponibilidad,
  press, transición Motion 1.1 y Reduced Motion no cambiaron.
- Route-fit, Camera, mapa, sheet, navegación funcional, pricing y persistencia
  permanecen intactos. Sin dependencias ni cambios nativos. Android físico
  PENDIENTE; no se generó EAS Build.
- Validación local: TypeScript, lint, 161 tests, worklets, Expo Doctor 21/21,
  schema MapLibre, export Hermes Android/iOS, splash y aislamiento de fixtures,
  pricing/servidor, rutas y credenciales de release, todos correctos.

### Bloque único de direcciones y radio superior Passenger — 2026-10-06

- Reviewing, confirm y requesting presentan Origen, paradas existentes y
  Destino dentro de una sola superficie blanca con borde y halo verde
  estáticos. Los divisores son internos; las filas embedded no llevan borde,
  sombra, fondo ni radio propios. Conservan pins, texto, targets, press, taps y
  estados disabled. Matching y assigned no usan este accesorio.
- El radio superior local del panel Passenger es 60 dp en Home, Search,
  reviewing, confirm y requesting, aplicado al header blanco real o al sheet
  redondeado según la fase. Las esquinas inferiores permanecen en 32 dp.
- El bloque permanece en el mismo header flotante y la tubería de mediciones
  no cambió: accesorio y panel se cuentan una vez. Home sigue al 50%, buscador
  a 58 dp y gap a 10 dp. Route-fit, Camera, mapa, lógica y Motion 1.1 siguen
  intactos. No hay dependencias ni cambios nativos; Android físico PENDIENTE.
- Validación local: TypeScript, lint, 161 tests, worklets, Expo Doctor 21/21,
  schema MapLibre, export Hermes Android/iOS, splash y aislamiento de fixtures,
  pricing/servidor, rutas y credenciales de release, todos correctos.

### Accesorios flotantes de Home, Search y confirmación — 2026-10-06

- El panel blanco Home conserva su altura de 50%, buscador de 58 dp y gap de
  10 dp. Sus esquinas superiores reales son de 44 dp; las inferiores siguen
  redondeadas a 32 dp cuando quedan visibles.
- Search de destino conserva el título flotante y aloja el único input, con
  borde y halo existentes, en el header del mismo `VimaRideSheet`. El panel
  comienza después del gap con handle y resultados; no hay reserva de título
  ni input duplicado en el contenido. Los demás modos Search mantienen su input
  interno y su comportamiento previo.
- Reviewing, confirm y requesting alojan origen y destino en el mismo slot
  flotante del header; el panel contiene Favoritos/CTA o métricas/pago/CTA.
  Se mantienen los campos, pins, halos, paradas, taps y estados disabled.
  Matching y assigned no usan este accesorio.
- Header y contenido siguen alimentando `headerMeasure`, `contentMeasure`,
  `visibleSheetHeight` y `settledSheetHeight` una vez cada uno. El footprint
  responde a la altura real nueva; no se tocaron route-fit, Camera, bounds,
  padding ni solicitudes de fit. El mapa y sheet siguen persistentes.
- La transición de escenas Motion 1.1, Reduced Motion y el único ciclo
  `useSearchCycle` continúan sin cambios. No hay dependencias ni cambios
  nativos. Android físico sigue PENDIENTE; no se generó EAS Build.
- Validación local: TypeScript, lint, 161 tests, worklets, Expo Doctor 21/21,
  export Hermes Android/iOS y schema MapLibre, splash, aislamiento de fixtures,
  pricing/servidor, rutas y credenciales de release, todos correctos.

### Visibilidad Motion 1.1 y cierre del panel Home/Search — 2026-10-06

- En Search normal de destino, «¿A dónde vamos?» usa el mismo pill flotante de
  40 dp, centrado y con elevación level1 que «Confirma tu viaje». El header
  interno conserva handle y espacio tipográfico reservado para no desplazar el
  input ni cambiar medición/snap; no duplica el texto.
- Home conserva su panel de 50% y buscador separado de 58 dp. Header y contenido
  comparten blanco continuo, radio superior de 32 dp e inferior de 32 dp cuando
  se ve el fondo. Search y reviewing/confirmación mantienen sus radios de 32 dp.
- El contenido de cada escena Passenger usa presencia con salida y entrada
  opuestas dentro del sheet persistente: 12 dp derivados de `shortEnterY * 2`,
  fade y duraciones aprobadas de 300 ms para Home/Search, 240 ms para
  reviewing/confirmación y 480 ms para matching/assigned. La clave de escena
  evita reanimar cambios de consulta o datos dentro de la misma fase. Reduced
  Motion conserva sólo fades. Mapa y `VimaRideSheet` no se remontan.
- El pill flotante de confirmación conserva su posición/estilo y entra con
  fade y 6 dp. SearchPulse termina al salir de matching; assigned usa una sola
  entrada de escena de 480 ms y conserva el haptic existente.
- Press sigue en .98/120 ms; el buscador Home y filas elevadas comprimen la
  sombra durante press y conservan el wash aprobado. Foco Search distingue
  borde verde oscuro y halo más visible con el fade existente de 160 ms;
  sigue habiendo un único ciclo continuo de 1900 ms. Las filas nuevas mantienen
  6 dp/160 ms y stagger de 24 ms. Bottom nav mantiene 240 ms y recorre 12 dp;
  Reduced Motion usa sólo fade.
- Route-fit, Camera, Search/Suggest/Discover funcional, teclado, persistencia,
  mapa, pricing, matching funcional, tabs y contratos siguen sin cambios.
  No se modificaron tokens JSON, dependencias ni código nativo. Android físico
  sigue PENDIENTE; no se generó EAS Build.
- Validación local: TypeScript, lint, 160 tests, worklets, Expo Doctor (21/21),
  export Hermes Android/iOS con schema MapLibre, splash y aislamiento de fixtures,
  pricing/servidor, rutas y credenciales en release, todos correctos.

### Cierre visual Home, Search y confirmación — 2026-10-05

- Sólo Home, Search/selección y reviewing/confirmación/requesting usan radio
  superior local de 32 dp en el panel. Matching/assigned conservan el radio
  del tema; no cambian snaps, gestos, safe area ni viewport.
- El pill Home conserva 58 dp, radio 24 y su frame/márgenes de `f4381e1`.
  Home y Search muestran borde verde permanente sobre la superficie además del
  halo exterior ya existente. Foco, fade de 160 ms, ciclo único de 1900 ms y
  Reduced Motion mantienen su política previa.
- Recientes de Home y «Ver todos» usan `PlaceRow` como lista rica, con thumbnail
  de 64 dp, media aprobada/fallback, dirección de hasta dos líneas, chevron y
  feedback Motion 1.1, sin elevación individual. Las colecciones iniciales de
  Search (Favoritos, Recientes, Populares, Vima Local) usan la misma presentación
  lista de Suggest/Discover; no se alteraron keys ni selección.
- Origen y destino en reviewing, confirmación y requesting son dos superficies
  compactas independientes con separación de 8 dp, borde y halo verde estático.
  El pin de destino sigue rojo y la semántica de taps/disabled permanece.
  No se añadió ciclo de animación a estos campos.
- Permanecen sin cambios el hook y los parámetros de route-fit, Camera,
  Search/Suggest/Discover funcional, mapa, routing, pricing, matching, persistencia
  y navegación. Validación física Android del acabado y la altura óptica del
  panel sigue PENDIENTE; no se generó APK ni se añadió código nativo.
- Verificación local: TypeScript, lint, suite 158/158, worklets, Expo Doctor
  21/21, export Hermes Android/iOS, schema/style MapLibre, splash y aislamiento
  de fixtures/release/credenciales/paths correctos.

### Geometría e intensidad del glow Home/Search — 2026-10-05

- El frame Home comparte exactamente el ancho útil, alto de 58 dp y radio de
  24 dp con el pill. El margen horizontal de 20 dp reside en el frame; el halo
  absoluto ocupa sólo sus cuatro lados y no participa en el layout. La
  posición, gap de 10 dp y medidas del mismo `VimaRideSheet` no cambian.
- Opacidad base del halo Home 0.18, Search 0.20 y Search enfocado 0.30; la
  respiración suave añade hasta 0.05 mediante el ciclo compartido existente
  de 1900 ms. El foco conserva fade de 160 ms. Reduced Motion deja el halo
  estático y visible, sin respiración. No cambia `useSearchCycle` ni el
  `SearchPulse` de matching. Android físico permanece pendiente.
- No cambian lista Search, resultados/teclado, Recientes, geometría del sheet,
  ruta/Camera/mapa, pricing, persistencia ni otros componentes Motion.
- Verificación local: TypeScript, lint, suite 155/155, worklets, Expo Doctor
  21/21, export Hermes Android/iOS, style MapLibre, splash y aislamiento de
  fixtures/release/credenciales/paths correctos. Sin EAS Build.

### Search lista ligera y glow compartido — 2026-10-05

- Search usa la variante `list` de `PlaceRow`: filas continuas sin elevación
  individual, radio y padding discretos, thumbnail de 48 dp, título, dirección,
  chevron y target de 56 dp. Conserva keys, selección, media/fallback,
  feedback de press y entrada escalonada Motion 1.1. Recientes de Home se
  refinaron después a lista rica; se conserva la geometría de panel y buscador.
- El buscador Home tiene halo verde suave; el campo Search usa la misma
  familia visual con más intensidad y transición de foco de 160 ms. El halo
  es una capa absoluta: no modifica tamaño ni layout. Su respiración sutil
  comparte el único ciclo de 1900 ms con `SearchPulse` de matching mediante
  `useSearchCycle`, llamado una sola vez por `PassengerScreen`. Home, Search y
  matching son estados excluyentes; al ocultarse, ir a background o activar
  Reduced Motion, el ciclo se cancela. Con reducción el halo queda estático
  y el foco conserva sólo fade. Matching conserva sus dos anillos y vehículo.
- No cambian Search/Suggest funcional, keyboard, route-fit/Camera, mapa,
  TomTom/Routing, Pricing, Traffic, matching/assigned funcional, controles,
  persistencia ni Motion tokens. No hay dependencia ni código nativo nuevo.
  Android físico permanece pendiente; no se generó APK.
- Verificación local: TypeScript, lint, suite 155/155, worklets, Expo Doctor
  21/21, export Hermes Android/iOS, schema/style MapLibre, splash y aislamiento
  de fixtures/release/credenciales/paths correctos.

### Motion 1.1 y cierre físico de Home Passenger — 2026-10-05

- Se amplía la cobertura del JSON aprobado de Motion v1 sin cambiar sus valores:
  `usePressFeedback` reutiliza escala .98 y 120 ms en botones, buscador,
  shortcuts, filas y controles; Reduced Motion suprime la escala. La entrada
  de contenido nuevo usa 160 ms y 6 dp (sólo fade con reducción), con stagger
  de 24 ms limitado a los primeros cinco resultados nuevos de Search. Keys de
  lugar estables evitan repetir la entrada por renders o reordenamiento.
- El contenido del sheet mantiene transición interrumpible de 300 ms y escena
  asignada de 480 ms; métricas y copy de matching cambian con el timing de
  estado de 240 ms. El pill de confirmación, avisos y acciones nuevas usan
  entradas breves. Search conserva resultados útiles durante Suggest y su
  loading permanece dentro del campo. `SearchPulse` conserva su único ciclo
  de 1900 ms, sin loop adicional.
- Bottom nav entra/sale en 240 ms con fade y 6 dp; Reduced Motion sólo fade.
  Sólo Inicio es funcional y las demás tabs siguen deshabilitadas. Brújula
  mantiene bearing real y fade de 160 ms. El menú de Capas abre en 300 ms y
  cierra en 240 ms con fade y desplazamiento corto (sólo fade en Reduced
  Motion), anclado entre Brújula y botón Capas con gap de
  8 dp; switches y Traffic/Incidents no cambian.
- Home conserva panel 50%, buscador 58 dp y fila guardados 44 dp. Header y
  contenido del panel comparten fondo blanco sin sombras separadas en la
  unión; se reduce sólo su espaciado vertical. Recientes mantiene hasta tres
  filas, thumbnails y ScrollView. No se cambia la frontera visible compartida
  de mapa/controles/CTA ni Home/Recenter de `3ebb1bd`.
- El basemap local ajusta sólo la intensidad de `landcover` ya admitido y
  `landuse` recreativo; conserva los verdes `#D8EEDB`/`#ECF6EF`, fuente,
  filtros, orden y neutralidad donde no hay feature. Una muestra pública de
  tiles OpenFreeMap de Atlacomulco encontró `wood/wood`, `grass/park`,
  `grass/meadow`, `grass/recreation_ground`, `farmland` y usos `pitch`,
  `playground`, `stadium`, `cemetery` entre z13–z14. El TileJSON sirve hasta
  z14 y el renderer sobreescala esos datos en z15–z16; no se infiere vegetación.
- Sin cambios en rutas, Camera/route-fits, matching funcional, pricing,
  persistencia, TomTom, contratos, Traffic, geometría de RouteLayer, safe area,
  top chrome, identidad ni disponibilidad de tabs. Sin dependencias ni código
  nativo nuevo; Android físico y juicio de fluidez permanecen pendientes.
- Verificación local: TypeScript, lint, suite 153/153, schema/style MapLibre,
  worklets, Expo Doctor 21/21, export Hermes Android/iOS, splash y aislamiento
  de fixtures/release/credenciales/paths correctos. No se generó APK.

### Correcciones físicas de Home Passenger — 2026-10-05

- Home normal usa un panel principal del 50% del frame útil, con ScrollView
  para Lugares guardados y hasta tres Recientes. El buscador sigue en el mismo
  `VimaRideSheet`: superficie separada de 58 dp, gap de 10 dp y tipografía
  `bodyMedium`. Los títulos de ambas secciones usan la misma escala contenida.
- La fila Casa/Trabajo/Favoritos mide 44 dp, con iconos de 20 dp y etiquetas
  siempre «Casa»/«Trabajo». Un slot vacío sigue abriendo su configuración;
  uno configurado sigue seleccionando el destino directamente. Persistencia,
  gestión, media y fallback de Recientes no cambian.
- Notificaciones mide 52×52 dp, conserva `level2`, su posición con safe area y
  su estado deshabilitado. El lockup y el resto del top chrome no cambian.
- El borde superior medido del buscador define la misma frontera inferior del
  viewport Home para Brújula/Capas, `LocationCTA` y cámara. Antes de la medida
  nativa se usa la geometría de la interacción del mismo sheet. Los controles
  y `Tu ubicación` quedan encima del buscador; el CTA reaparece tras pan.
  Home inicial y Recenter usan el mismo centro óptico, sin el viejo incremento
  fijo de 28 dp calibrado para otra altura. Reduced Motion conserva su política.
- Las geometrías de Search, reviewing, confirm, request, matching y assigned,
  así como los dos route-fits (incluido `confirmationBottomPadding=28`), siguen
  como en `0030739`. No cambian navegación, bottom nav, edge-to-edge, mapa/sheet
  persistentes, TomTom, routing, pricing, matching ni contratos. Sin cambios
  nativos ni EAS Build.
- TypeScript, lint, suite completa (150/150, incluido schema/style MapLibre),
  worklets 19/19, Expo Doctor 21/21, export Hermes Android/iOS y checks de
  splash, credenciales, fixtures, release y paths correctos.
- PENDIENTE ANDROID FÍSICO: verificar panel y scroll de tres Recientes,
  buscador separado, jerarquía de Notificaciones, Brújula/Capas y `Tu ubicación`
  siempre visibles sobre el buscador, pan + Recenter, y ambos fits con pins
  completos. La implementación no se marca como probada en dispositivo.

### Cierre de composición Home y controles Passenger — 2026-10-05

- Los valores de Home 69%/76 dp/48 dp de esta entrega son históricos y fueron
  sustituidos por la corrección física indicada arriba; los demás estados y
  el fit de confirmación se conservan.
- Sólo Home normal usa un panel principal de 69% del frame útil. El buscador
  «¿A dónde vamos?» permanece dentro del mismo `VimaRideSheet`, como superficie
  blanca de 76 dp y radio 24, separada 10 dp del panel. El panel comienza en
  Lugares guardados; el área táctil del sheet incluye el buscador. Search,
  reviewing, confirmación, request, matching y assigned conservan sus snaps.
- La fila Casa/Trabajo/Favoritos mide 48 dp. Recientes conserva hasta tres
  filas compactas con `resolvePlaceMedia` o fallback semántico. Persistencia y
  acciones de slots, Favoritos y Recientes no cambiaron.
- Brújula de 44 dp está en la columna de controles inmediatamente encima de
  Capas, fuera del top chrome. Mantiene acción al norte y fade de 160 ms bajo
  ambas políticas de movimiento. Notificaciones permanece sola arriba a la derecha.
  Menú de capas tiene ancho mínimo 192 dp e «Incidentes» una sola línea.
- El fit temprano de reviewing conserva padding y bounds. Sólo el fit posterior
  a «Confirmar ubicaciones» suma 28 dp de padding inferior para desplazar
  ópticamente la ruta unos 14 dp hacia arriba; conserva geometría, clearance
  de pins, Camera y lifecycle.
- Sin cambios en persistencia, TomTom, routing, pricing, matching, RouteLayer,
  Traffic, basemap, edge-to-edge, safe area ni bottom nav. Sin dependencias ni
  cambios nativos; no se ejecutó EAS Build.
- TypeScript, lint, suite 149/149 (incluido schema/style MapLibre), worklets
  19/19, Expo Doctor 21/21, export Hermes Android/iOS y checks de splash,
  credenciales, fixtures, release y paths correctos.
- PENDIENTE ANDROID FÍSICO: comprobar altura/densidad/scroll en Home, toque del
  buscador separado, columna brújula/Capas y menú expandido, tres Recientes,
  media/fallback y visibilidad completa de ruta y pins tras confirmar.

### Home con Lugares guardados y Recientes reales — 2026-10-05

- Home mantiene «¿A dónde vamos?» como acción principal. «Lugares guardados»
  muestra Casa, Trabajo y Favoritos en una fila compacta de 48 dp; los slots
  vacíos ofrecen agregar, los configurados seleccionan su destino directamente.
  Favoritos abre la colección real. No hay favoritos individuales ni Frecuentes
  dentro de Home.
- «Ver todos» abre subestados de gestión en el sheet existente: configurar,
  cambiar y eliminar Casa/Trabajo; ver, agregar y eliminar Favoritos. La elección
  reutiliza Search/resolve y selección de mapa. Volver conserva mapa/shell.
- `personalPlaces` añade una clave v1 independiente para Home/Work; persiste
  `SavedPlace` sanitizado completo, incluida imagen/categoría/región cuando
  existen, sin reescribir claves previas de Favoritos y Recientes.
- «Viajes recientes» muestra hasta tres destinos según el espacio útil. Su lista
  completa abre fuera del contenido Home. Cada fila usa media aprobada resoluble
  o el fallback semántico de `PlaceThumbnail`, sin imagen inventada. Tocar un
  reciente selecciona destino directamente. La confirmación sigue conservando
  imagen, categoría y metadatos disponibles.
- Sin cambios en mapa/basemap, top chrome, cámara/route-fit, sheet/snaps,
  bottom nav, pricing, TomTom/routing, matching ni Motion System.
- TypeScript, lint, suite 148/148, worklets 19/19, Expo Doctor 21/21,
  export Hermes Android/iOS y checks de splash, fixtures, release, paths y
  credenciales correctos. No hay cambio nativo ni EAS Build.
- PENDIENTE ANDROID FÍSICO: revisar densidad y scroll en tamaños útiles,
  media/fallback, persistencia entre reinicios y retorno desde gestión.


### Detalle cercano de landcover/landuse Passenger — 2026-10-05

- El estilo local Positron conserva el aspecto hasta z12. `landcover_wood` pasa
  gradualmente de `#ECF6EF` a `#D8EEDB` entre z13 y z16; se añaden fills para
  `class=grass`, `farmland` y `wetland`, con intensidad 35/55/75/100% en
  z13/14/15/16. Farmland y wetland conservan opacidad menor. Desde z14, grass
  distingue las subclasses documentadas `garden`, `park`, `recreation_ground`
  y `golf_course` con el verde principal. Desde z15, `landuse` aplica un wash
  tenue a `pitch`, `playground`, `stadium`, `theme_park`, `zoo` y `cemetery`.
- Las capas nuevas se insertan debajo de agua, vías y labels. Las capas originales
  mantienen orden, filtros y geometría; agua, vías, edificios, labels, ruta,
  Traffic, incidentes, pins y todo el shell no cambiaron. La selección de style
  custom y la exigencia de style productivo permanecen intactas.
- TypeScript, lint, suite 144/144, schema MapLibre, worklets 19/19, Expo Doctor
  21/21, export Hermes Android/iOS y checks de splash, fixtures, release,
  paths y credenciales pasaron. No hay cambio nativo ni EAS Build.
- PENDIENTE ANDROID FÍSICO: comparar z13, z14, z15 y z16+ con tiles reales;
  comprobar riqueza de vegetación/recreación sin pérdida de legibilidad de agua,
  vías, labels, ruta, Traffic y pins. No se marca como validado en dispositivo.

### Cierre de basemap y top chrome Passenger — 2026-10-05

- Home mantiene mapa detrás de la status bar transparente con contenido oscuro. El
  lockup aprobado conserva 32 dp, proporción, ausencia de fondo y `level1`; su posición
  es left 16 dp y top `safeAreaTop + 14 dp`. Notificaciones conserva su comportamiento
  deshabilitado actual, sin badge, con 44×44 dp, right 16 dp, top `safeAreaTop + 8 dp`
  y `level2`. No cambian las posiciones del chrome de otras fases.
- La brújula de presentación Vima sustituye al ornamento nativo no personalizable:
  44×44 dp, right 16 dp, top `safeAreaTop + 64 dp` (12 dp bajo notificaciones), `level1`.
  Lee el bearing real y sólo aparece fuera del norte con fade de 160 ms. Reduced Motion
  conserva únicamente el fade permitido; orientar al norte usa el movimiento de cámara
  existente y se vuelve inmediato con reducción de movimiento. La acción sólo envía
  bearing 0, sin center, zoom, pitch, bounds ni padding.
- El Positron de OpenFreeMap que ya se utilizaba se incorpora localmente con sus licencias.
  `basemap.ts` cambia sólo colores de paint: urbano `#F7F8F7`, secundarias `#F5F6F7`,
  principales `#EBEBEB`, verdes secundarios `#ECF6EF`, parques `#D8EEDB`, agua `#BFDDF9`.
  Se conservan orden de capas, fuentes, filtros, etiquetas, opacidades y anchos. No hay
  overlays que tinten el mapa; ruta, pins y tráfico mantienen su estilo y prioridad.
  Otros estilos explícitos siguen siendo autoritativos y producción sigue requiriendo
  `EXPO_PUBLIC_MAP_STYLE_URL`; no se cambia proveedor ni se activa un fallback productivo.
- Sin cambios en sheet, bottom nav, clipping/radios/márgenes, oclusión de cámara,
  route-fit, navegación, matching o pricing. Sin dependencias ni configuración nativa nueva.

VERIFICACIÓN AUTOMÁTICA: TypeScript y lint limpios; suite 143/143; worklets 19/19;
Expo Doctor 21/21; schema de estilo MapLibre válido; export Hermes Android/iOS,
aislamiento de fixtures, pricing/servidor/paths y límite de credenciales del bundle
correctos. No requiere reconstruir el Development Build ni se ejecutó EAS.

PENDIENTE ANDROID FÍSICO: comprobar posiciones reales sobre status bar/notch, columna
notificaciones/brújula al rotar, fade con y sin Reduced Motion, legibilidad de verdes/agua
y contraste de ruta/pins/tráfico con tiles reales. No se marca como validado en dispositivo.

### Pulido visual Home/map shell — 2026-10-05

- Home centra la ubicación actual 14 dp más arriba mediante 28 dp de padding inferior
  adicional en el encuadre automático. Recenter usa el mismo desplazamiento respecto al
  viewport útil; route-fit conserva sus bounds y padding anteriores. No cambiaron la
  geometría edge-to-edge, safe area, clipping/radios, snaps ni navegación.
- El lockup oficial mide 32 dp de alto visible, conserva su ancho proporcional y posición,
  permanece sin chip/fondo y usa `level1`. Campos, chips y filas internas del pasajero usan
  `level1`; VimaRideSheet conserva `level2` y los controles flotantes usan `level2`.
- El control compacto de capas mide 44×44 dp con icono de 24 dp, fondo blanco y pressed
  `#F7F8F7`. El press scale aprobado sigue en 0.98 y Reduced Motion lo deja estático.
  El CTA flotante de ubicación conserva su geometría y también usa ese fondo pressed.
- Acción primaria, estado activo y origen usan verde `#00D68F`; ubicación/recenter y
  mensajes informativos del mapa usan azul `#3B82F6`; alertas continúan ámbar
  `#F59E0B`; controles neutros y tabs inactivas usan graphite `#2A2E2D`; destino y
  peligro conservan rojo `#FF3830`. Bottom nav sólo pinta Inicio activo en verde.
  El renderer, RouteLayer, Traffic, TomTom y contratos no cambiaron.

VERIFICACIÓN AUTOMÁTICA: TypeScript y lint limpios; suite 139/139; worklets 18/18;
Expo Doctor 21/21; export Hermes Android/iOS, splash y aislamiento de fixtures y
pricing/servidor correctos. La validación visual en dispositivo sigue PENDIENTE.

PENDIENTE: verificar en Android físico el centrado visual de Home/recenter (+14 dp), la
presencia y separación del lockup, la interactividad de controles, la profundidad de
superficies, la lectura semántica de iconos y Reduced Motion. No se ejecutó EAS Build;
los cambios son JavaScript/estilos y no exigen reconstruir el Development Build.

### Mapa Passenger edge-to-edge y fit horizontal simétrico — 2026-10-05

Esta decisión sustituye la status area carbón/light y la reserva superior sólida descritas
en la sección histórica siguiente. El mapa empieza en el top del root y se extiende detrás
de la status bar, que el proyecto Android generado ya configura transparente con
edge-to-edge. Expo StatusBar usa contenido oscuro. No hay scrim: el basemap de desarrollo
es claro y el contraste real sobre tiles queda pendiente de comprobar físicamente.

- `MapViewportClip` conserva inset lateral de 4 dp, radios superiores 24 dp y clipping.
  No hay spacer previo de `safeArea.top + 4 dp` ni nueva barra blanca. El logo, notificaciones,
  Back, pill y avisos superiores suman mecánicamente ese desplazamiento a su posición dentro
  del mapa; su ubicación física respecto a la pantalla permanece igual.
- El mapa gana el área superior, mientras el cálculo del sheet usa el alto equivalente al
  anterior (`mapHeight - safeArea.top - 4 dp`). La base gestual, snaps, ancho completo y
  posición física del sheet se conservan. La oclusión superior de Camera suma el mismo
  desplazamiento de marco: el clearance físico vertical, el padding inferior y el segundo
  fit mantienen su resultado previo. Los controles flotantes conservan sus posiciones.
- `fitRoute.padding.left` y `.right` usan exactamente un valor común:
  `max(padding.left, padding.right, passengerPinClearance.side)`. Ni MapControls, ni el
  menú de capas, ni LocationCTA alteran ese padding lateral. El clearance del pin permanece;
  no cambian bounds, geometría, lifecycle, timings, easing o Reduced Motion.

VERIFICACIÓN AUTOMÁTICA: TypeScript y lint limpios; suite completa 136/136; worklets
18/18; Expo Doctor 21/21; export Hermes Android/iOS y aislamiento de fixtures y
pricing/servidor correctos. Las pruebas de mapa/shell y flujo Passenger confirman simetría
con capas cerradas y abiertas, independencia de LocationCTA, padding vertical, segundo fit,
safe chrome y sheet persistente. La inspección Android física sigue PENDIENTE.

PENDIENTE ANDROID FÍSICO:

1. Mapa visible detrás de hora, señal y batería.
2. Status bar totalmente transparente.
3. Iconos y texto del sistema oscuros.
4. Sin barra carbón.
5. Sin barra blanca.
6. Márgenes laterales actuales intactos.
7. Radios superiores de 24 dp intactos.
8. Logo y notificaciones separados de los iconos del sistema.
9. Pill separado de los iconos del sistema.
10. Home correcto.
11. Search correcto.
12. Confirmación correcta.
13. Ruta horizontalmente centrada.
14. Espacio visual izquierdo y derecho equivalente.
15. Abrir el menú de capas no desplaza la ruta.
16. Ambos pins completos.
17. Fit vertical visualmente igual al anterior.
18. Segundo fit visualmente igual al anterior.
19. Pan y recenter sin regresión.
20. Reduced Motion sin regresión.

No se modifica configuración nativa ni dependencias. No se ejecuta EAS Build; este cambio
de JavaScript/estilos no exige reconstruir el Development Build vigente.

### Chrome de confirmación y navegación Home-only — 2026-10-05

Esta sección reemplaza únicamente la regla histórica de visibilidad de bottom nav descrita
más abajo. El mapa, sheet, medición, cámara y route-fit de `b7a8905` se conservan.

- La zona física de la status bar usa una superficie carbón `#0B0F0E` bajo los iconos claros.
  El espacio total previo al mapa sigue siendo `insets.top + 4 dp`; el gap exterior de 4 dp
  conserva el fondo del root. No se crea un header blanco ni una compensación vertical nueva.
- En confirmación real, «Confirma tu viaje» se muestra en un pill blanco flotante sobre el mapa:
  centrado en el viewport completo, 12 dp desde el inicio útil del mapa, 40 dp de alto,
  padding horizontal 16 dp, radio 999, Inter 600 de 16 dp en carbón y elevación aprobada
  nivel 1 (offset Y 2, blur 8, carbón al 6%). El título sale del chrome superior, donde
  permanece el botón de regreso. El pill no reserva altura ni remonta MapLibre o el sheet.
- La oclusión superior considera el extremo inferior del pill junto al chrome existente y
  su separación de 12 dp. En esta geometría, el chrome de 56 dp ya cubre el pill de 52 dp:
  `topOcclusion` permanece en 68 dp, sin sumar de nuevo safe area ni gap. El segundo fit
  después de confirmar ubicaciones sigue usando el sheet realmente medido.
- La bottom nav Inicio/Viajes/Pagos/Perfil aparece sólo en Home normal, sin destino ni field
  activo. Desaparece en Search, selección/reviewing, confirmación, solicitud, matching y
  asignación; reaparece al volver a Home. Fuera de Home no deja una altura reservada y el
  contenido del sheet conserva protección inferior con `insets.bottom`. Usa las transiciones
  ya existentes, sujetas a Reduced Motion.

VERIFICADO AUTOMÁTICAMENTE: TypeScript y lint limpios; suite completa 136/136; worklets
18/18; Expo Doctor 21/21; export Hermes Android/iOS y aislamiento de fixtures y
pricing/servidor correctos. Las pruebas de shell comprueban status, dimensiones del pill,
visibilidad, oclusión sin duplicar insets, layout, segundo fit, retorno a Home, persistencia
de mapa/sheet y modo Reduced Motion. La verificación física Android sigue PENDIENTE.

PENDIENTE ANDROID FÍSICO:

1. En confirmación, status area carbón `#0B0F0E`.
2. Hora, batería y señal claras.
3. Gap superior de 4 dp intacto.
4. Mapa con su radio superior actual.
5. Sin barra blanca.
6. Pill pequeño «Confirma tu viaje».
7. Pill centrado en el viewport.
8. Pill a 12 dp del top útil del mapa.
9. Ruta y ambos pins visibles.
10. Sin bottom nav en confirmación.
11. Sheet a ancho completo.
12. En Home, pill ausente.
13. En Home, bottom nav visible.
14. Bottom nav absorbe el inset inferior.
15. Mapa y sheet permanecen montados.
16. Al entrar a Search, nav desaparece.
17. En reviewing, nav permanece oculta.
18. Al confirmar, nav permanece oculta.
19. Al volver a Home, nav reaparece.
20. Reduced Motion conserva el comportamiento esperado.

No hay cambio nativo, dependencia ni configuración Expo; no se ejecuta EAS Build ni se
requiere reconstruir el Development Build por este ajuste de JavaScript/estilos.

### Safe area, viewport y movimiento del fit — 2026-10-05

Esta decisión sustituye el margen de mapa de 16 dp descrito en la sección histórica siguiente.
El video Android `51842.mp4` sirvió para identificar el mapa bajo la status bar, el sheet
inset y el salto de cámara; no es una prueba física de los cambios de esta rama.

- El root conserva `#F6F7F8`. Un espacio real de `insets.top + 4 dp` antecede la superficie:
  MapLibre ya no ocupa la status bar. Dentro de la superficie, sólo `MapViewportClip` aplica
  4 dp a cada lado y radios superiores 24 dp, con clipping y contenedor nativo no colapsable.
  No hay gap inferior equivalente.
- `VimaRideSheet` queda superpuesto a ancho completo y mantiene sus gestos, snaps y reglas
  de altura. La bottom nav permanece fuera del mapa y a ancho completo, con visibilidad e
  inset inferior anteriores. Logo y notificaciones flotan a 8 dp del nuevo comienzo del
  mapa; la safe area superior no se suma nuevamente a su posición ni al padding de Camera.
- `topOcclusion` representa sólo chrome dentro del mapa más su separación. El fit añade
  clearance derivado del tamaño, rotación y entrada del pin existente para conservar
  completos origen y destino. Su padding inferior toma el sheet medido; reserva la CTA
  «Tu ubicación» sólo cuando aparece, y la reserva lateral incluye el control del mapa o
  su menú expandido sólo cuando está abierto, más el ancho del pin. Margen externo, gap
  superior, safe area y nav no son padding interno.
- La intención temprana sigue siendo única por quote/draft válida, espera la medición real
  y respeta Search y pan manual. Confirmar ubicaciones conserva una segunda intención tras
  el nuevo layout. No cambia geometría, bounds, routing ni RouteLayer.
- Diagnóstico del salto: `Camera` enviaba 420 ms a `setStop(bounds)` sin `easing`. En el
  código Android de MapLibre 11.4, `CameraStop` deja el easing en `NONE` cuando se omite y
  `CameraUpdateItem` llama `moveCamera` (inmediato) si `easing == NONE`, aunque la duración
  sea positiva. El fit y recenter normales ahora envían `easing: 'ease'`, opción nativa
  soportada; Reduced Motion sigue enviando `duration: 0`. No se cambió el token de 420 ms.

VERIFICADO AUTOMÁTICAMENTE: TypeScript y lint limpios; suite completa 135/135; worklets
18/18; Expo Doctor 21/21; export Hermes Android/iOS, aislamiento de fixtures y de
pricing/servidor correctos. Las pruebas de componentes y dobles MapLibre comprueban
separación de superficies, insets sin duplicación, padding medido/footprint, una sola
intención y políticas normal/Reduced Motion. No certifican clipping, duración percibida,
teclado ni encuadre real en Android.

PENDIENTE ANDROID FÍSICO (sobre esta rama):

1. Status bar completamente fuera del mapa.
2. Gap superior visible de 4 dp.
3. Gaps laterales visibles de 4 dp.
4. Radio superior de 24 dp y clipping de tiles/ruta/markers/traffic/vehicle.
5. Sheet hasta ambos extremos de pantalla.
6. Bottom nav hasta ambos extremos de pantalla.
7. Seleccionar destino.
8. Esperar la quote y la ruta.
9. Comprobar desplazamiento perceptible de cámara con los 420 ms vigentes.
10. Origen completo dentro del viewport útil.
11. Destino completo dentro del viewport útil.
12. Ruta completa visible sobre el sheet, sin oclusión de controles/CTA.
13. Pan/zoom manual: no vuelve a encuadrar la misma quote.
14. Nuevo destino/quote: nuevo fit automático.
15. Confirmar ubicaciones: segundo fit tras la nueva medición.
16. Reduced Motion: mismo encuadre final mediante snap.
17. Search/teclado: nav se oculta y el layout sigue utilizable.
Comprobar también status/navigation bar con botones y gestos y distintos insets.

Sin cambios nativos, dependencias ni configuración Expo. No se ejecutó EAS Build; esta
tarea no exige reconstruir el Development Build.

### Shell persistente y auto-fit reviewing — 2026-10-04

Implementado desde `b2a9c11`. Esta sección sustituye el shell anterior con header blanco,
SafeAreaView global y navegación Inicio/Favoritos; no cambia pricing ni reglas comerciales.

- Root normal `#F6F7F8`; superficie principal con margen horizontal 16 dp, radios superiores
  24 dp, sin borde, `overflow: hidden` y contenedor nativo no colapsable. `MapViewportClip`,
  MapLibre y `VimaRideSheet` siguen montados durante todo el flujo.
- Chrome flotante sobre mapa: lockup master izquierdo, sin fondo/chip/wordmark runtime;
  notificaciones 40 dp con icono existente de 24 dp, sombra y hitSlop hasta 48 dp. No existe
  boundary de notificaciones: está deshabilitado accesiblemente y sin badge ni navegación.
  El resto de fases conserva back/títulos sobre mapa, sin reservar una barra blanca.
- `useSafeAreaInsets`: top sólo en chrome; bottom sólo en nav cuando está visible. Al ocultar
  nav, el contenido del sheet protege sus acciones con el inset inferior. La superficie del
  mapa no recibe un SafeAreaView global. Insets/medición del chrome se incorporan una vez
  a la oclusión superior usada por fit y recenter/visibilidad de «Tu ubicación».
- Bottom nav externo al mapa: Inicio/Viajes/Pagos/Perfil, iconos 24 dp y labels 12 dp Medium.
  Sólo Inicio es funcional y seleccionado; los otros tres tabs están disabled, sin rutas ni
  handlers. Altura mínima 72 dp; crece si el inset inferior exige mantener hit targets de
  48 dp. Favoritos permanece dentro del flujo, sin tab inferior.
- Nav visible en Home/reviewing/confirm; se retira en cualquier field/Search, requesting,
  matching y assigned. Fade con timings vigentes, sin trasladar el mapa ni remount de
  mapa/sheet. Reduced Motion conserva aparición simple y la política de Camera existente.
- `usePassengerRouteFit` emite un RouteFitIntent por identidad estable de quote/draft al
  llegar una ruta válida durante reviewing. Incluye origen, todos los puntos LineString o
  MultiLineString y destino. Sólo valida el candidato de cámara; no modifica route payload.
- El fit espera mapa listo, layout de la superficie acorde al nav, medición natural de
  contenido/header y altura visible REAL de la composición actual, al terminar su snap.
  Las mediciones tienen clave de composición; callbacks obsoletos no autorizan un fit.
  Sólo se remonta contenido medido, nunca mapa ni sheet; escribir o recibir quote tardía
  durante Search no reemplaza el input ni roba cámara.
- Confirmar ubicaciones conserva una intención independiente y espera el layout real de
  confirmación. No reutiliza altura de reviewing. Cada intención captura su altura real;
  Camera/fitBounds vigentes consumen una secuencia una sola vez. No hay polling, timers,
  nuevos cálculos de bounds ni refit por pan, tráfico, sheen, renders o cambios menores de
  altura. Una nueva quote/draft habilita otro fit temprano; cada pulsación de Confirmar
  habilita sólo su segundo fit.
- Padding interno: sheet real y chrome superpuesto, más reserva existente de controles.
  Ni los 16 dp exteriores ni la barra inferior se suman dentro del mapa. Incidentes se
  colocan bajo el chrome, y LocationCTA considera la oclusión superior nueva.
- Sin cambios en PricingEngine/Config, endpoint de quotes, priced/unpriced/TTL/idempotencia,
  TomTom/routing/route_unavailable, RouteLayer/routeGeometry, matching, ranking, pagos,
  master assets, tokens Visual/Motion, Camera ni reglas/gestos/snaps de VimaRideSheet.

Validaciones: TypeScript y lint sin errores/warnings; suite completa 134/134; worklets
18/18; Expo Doctor 21/21; export Hermes Android/iOS e aislamiento de fixtures/servidor
correctos. Continúan los avisos previos de MODULE_TYPELESS_PACKAGE_JSON y deprecación
react-test-renderer. Se revisaron siete composiciones mediante proyección HTML local
con dobles nativos, sin certificar Yoga, rasterización de mapa o Android físico.

No hay cambios nativos, dependencias ni config Expo. No se ejecutó EAS Build ni se generó
APK; esta tarea no requiere un Development Build nuevo.

PENDIENTE ANDROID FÍSICO (no marcado como probado):

1. Home: logo izquierdo sin chip, notificaciones sin badge, fondo exterior, margen/radio y
   clipping real de tiles/markers/route/traffic/vehicle.
2. Search: nav desaparece, recupera espacio, teclado/foco correctos; cerrar restaura nav y
   selección sin remontar mapa/sheet.
3. Seleccionar destino y esperar ruta SIN Confirmar: fit reviewing incluye ambos pines y
   toda la ruta sobre el sheet, con padding real.
4. Pan/zoom después del fit: cámara no regresa sola; nuevo destino/quote habilita un nuevo fit.
5. Confirmar ubicaciones: esperar nueva altura; segundo encuadre correcto sin repeticiones.
6. Recenter/LocationCTA, incident card y back interno en la nueva superficie.
7. Reduced Motion: mismos encuadres, sin animación espacial prolongada.
8. Safe areas: status bar, navegación Android de botones/gestos, distintos insets y teclado;
   landscape únicamente si lo admite la configuración vigente.

### Refinamiento de composición, ruta y ubicación contextual — 2026-10-04

Esta ronda sustituye las decisiones anteriores de origen verde, casing blanco y recenter
circular siempre visible. Los apartados fechados anteriores quedan como historial.

- Inicio presenta una única acción principal «¿A dónde vamos?» de 52 dp, atajos y recientes.
  El origen conserva sus estados y edición: acceso en el header y campos en selección/confirmación.
  Carga/error de ubicación quedan como aviso sobre mapa. Branding y assets no cambian.
- Barra inferior con Inicio y Favoritos reutiliza returnHome y la búsqueda vacía con Favoritos
  existentes. No crea rutas, tabs de Viajes/Pagos/Perfil ni funciones nuevas. Se oculta durante
  solicitud, matching y viaje asignado. Back Android mantiene su manejo interno anterior.
- Origen carbón en token/marker/campos; destino rojo. Markers nativos después de la ruta en
  composición, sobre las capas GL. La ubicación azul representa currentLocation real,
  nunca un origen manual; permanece disponible durante selección/confirmación.
- Ruta azul sobre Traffic sin borde blanco: sombra carbón y halo azul difuminados. Sheen
  en un único LineString continuo que recorre la ruta, con entrada/salida de opacidad;
  sin extremos redondos independientes por cada segmento ni conectores inventados entre
  partes desconectadas. Geometría base, routing, fit y basemap conservados.
- «Tu ubicación» centrado sobre el sheet sólo cuando la proyección nativa queda fuera del
  área visible útil. Se espera el fin del movimiento y 150 ms de estabilidad; histéresis
  de 8/24 dp e invalidación de respuestas tardías evitan parpadeos. Sin polling ni comandos
  de cámara por observar visibilidad. Mantiene recenter explícito, busy y confirmación nativa.
- VimaRideSheet informa su altura visible durante drag/snap; header, barra inferior y safe
  areas quedan fuera del contenedor del mapa. Se comparan coordenadas locales en dp.
- Entradas compartidas inmediatas de cards/CTA/overlays: fade de 240 ms y desplazamiento
  de 4 dp; contenido entre estados de 6 dp. Reduced Motion suprime desplazamientos y loops,
  con fade simple. Pulso ubicación de 960 ms y opacidad menor, manteniendo núcleo opaco.
- No hay dependencias ni configuración nativa nuevas. Esta ronda no exige otro Development
  Build; sigue aplicando el requisito anterior de tener expo-image en el APK instalado.

Verificación: TypeScript y lint sin errores ni warnings; suite completa 127/127; worklets
18/18; Expo Doctor 21/21; export Hermes Android/iOS correcto. Permanecen los avisos
no bloqueantes existentes de Node MODULE_TYPELESS_PACKAGE_JSON y react-test-renderer.
Revisión de siete composiciones mediante proyección HTML de componentes/dobles nativos,
con animaciones en su estado final. No certifica Yoga ni rasterización MapLibre.
Pendiente físico Android: contraste halo/Traffic ON, continuidad del sheen, prioridad de pins,
CTA al pan/zoom/drag y bordes/safe areas/teclado, legibilidad de la nueva barra y Reduced Motion.
El style productivo final sigue pendiente de aprobación; se conserva la configuración vigente.

### Dirección visual luminosa Passenger P0 — 2026-10-03

- Nueva [referencia principal de UI/UX](design/PASSENGER_VISUAL_DIRECTION_2026-10-03.md)
  conservada en docs/design/references, con exclusión expresa de su branding. Logo, lockup,
  splash nativo y demás assets Vima no cambian. Acceso/login sigue sin pantalla/contrato;
  no se añade a partir del board ni se crean tabs, categorías o acciones nuevas.
- Acabado centralizado en `design/presentation.ts`: cards blancas, fondos neutros, bordes
  suaves, lavados semánticos y sombras existentes; Inter con más aire entre líneas.
  Header, search pill 52 dp, resultados, selección y sheet comparten ese lenguaje.
  CTA pasajero verde oscuro sólido, mínimo 56 dp, label legible en disabled/loading,
  secundarios táctiles y acciones con iconos de la misma familia existente.
- Confirmación conserva las tres métricas: precio con énfasis sólo cuando existe,
  estado sin precio legible y pago ausente explícito; sin chevron que simule edición de pago.
  Matching conserva copy/estados y progreso, con anillos más discretos. Conductor conserva
  ETA/PIN/placa; avatar neutral por falta de foto en contrato, fallback de vehículo con icono
  y las acciones Llamar/Seguridad existentes, sin añadir Mensaje ni datos de identidad.
- Traffic usa trazo 2.5 dp al 60%, por debajo de ruta azul/casing blanco; ubicación con núcleo
  siempre visible, aro suave y pulso menor. Controles/incident card/toast comparten superficies.
  Cámara, geometría, basemap configurado, permisos y contratos siguen intactos. No se añade
  compass personalizado: no existía y requeriría una nueva acción de cámara.
- Motion contenido: control 0.98, halo ubicación 1.18, brillo ruta 0.16, rebote pin 0.5 dp;
  launch de app sale en 480 ms/8 dp sin esperas decorativas. Reduced Motion mantiene las
  reglas vigentes (launch fade 160 ms, sin loops/transformaciones espaciales); loading de
  botón conserva label estático y estado accesible busy. Sheet mantiene sus gestos/timings.
- Esta ronda no añade dependencias ni configuración nativa. No se genera APK. Sólo sigue
  siendo necesario reconstruir si el Development Build todavía carece del `expo-image`
  añadido en la ronda premium/media anterior.

### Contraste y acento secundario P0 — 2026-10-03

- Ruta pasajero azul `#2F80FF`, sobre casing blanco existente y por encima de Traffic.
  Geometría, fit, clipping y flujo animado no cambian; Reduced Motion conserva ruta completa
  sin highlight repetido. Origen verde, destino rojo y CTA/pricing/matching verdes se mantienen.
- Tokens aprobados accentBlue/Pressed/Soft/Glow incorporados al JSON autoritativo. Se usan
  en ubicación actual, controles activos, switches de capas, foco de Search, categorías
  informativas y toast. Recenter conserva su confirmación nativa y autodismiss; su loading
  muestra spinner con motion normal e icono estático con Reduced Motion.
- VimaGlyph sustituye aproximaciones de Views por Material Symbols regular, una familia
  consistente de 24 dp en header, controles y acciones P0. Se reutiliza la fuente local ya
  instalada por Expo Router, ahora declarada directamente y cargada con Inter antes del shell.
  Sin descarga runtime, nuevos módulos nativos ni modificación de assets de marca.
- Controles de 48 dp con superficies neutras, azul activo/pressed, elevación contenida,
  cierre de capas reconocible y divisor entre toggles. Sheet y paneles con borde/profundidad
  sutil; incidentes con cierre de la misma familia, datos separados y severidad disponible.
  No cambia ningún flujo, contrato live, backend, búsqueda, pricing ni regla funcional.
- No se ha validado en Android físico. Falta comprobar contraste sobre tiles live con
  Traffic ON/OFF, iconos a escala real, estados de controles y paneles con texto ampliado.
  El style productivo definitivo sigue pendiente. Esta ronda no exige otro APK; si el build
  todavía no incluye `expo-image` de la ronda anterior, continúa pendiente aquella reconstrucción.

### Corrección incremental Android P0 — 2026-10-02

- Volver desde revisión de ubicaciones o confirmación regresa a Inicio, conserva el origen
  y descarta el destino del borrador sin desmontar mapa/shell. Back de Android se consume
  sólo mientras el shell está enfocado; cierra Search/detalle/capas primero. No cancela
  viajes activos ni solicitudes pendientes ni sustituye su cancelación explícita.
- Recenter usa el padding vigente de cámara, incluida la altura medida del sheet.
  Header y safe area ya están fuera del contenedor del mapa y no se descuentan dos veces.
  Search mantiene su bloqueo automático y Reduced Motion sigue usando duración cero.
- Tap de un punto de incidente abre una tarjeta pequeña con categoría, descripción y
  magnitud del retraso disponibles en el tile Orbis. Se cierra con ×, back o toque en el mapa
  o contenido del sheet. No se inventan calles: el esquema de tiles no ofrece nombre de vía.
  No se añadió consulta Incident Details ni dependencias/configuración nativa.
  Esquema consultado: [TomTom Orbis Vector Incident Tiles](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-incidents/vector-incident-tiles).
- Validación de esta corrección: TypeScript, lint y `npm test` (93/93) PASS.
  Pruebas de React con límites nativos simulados; pendiente comprobar back físico,
  recenter/encuadre y selección de incidentes live en Android real. No se generó APK.
  Persisten los warnings conocidos de Node sobre tipo de módulo y react-test-renderer.

- Shell persistente de pasajero con MapLibre y `MapViewportClip` externo. Search conserva el
  estado del viaje, oculta sólo ruta/destino/vehículo previos y bloquea ajustes automáticos de
  cámara. Recenter envía una intención explícita aun durante Search.
- Búsqueda local inmediata: Favoritos y Recientes privados versionados en SQLite/KV, catálogo
  curado Vima Local, cache breve y una lista mezclada. Suggest se inicia tras 200 ms y sus
  respuestas obsoletas se descartan. Estado vacío muestra Favoritos, Recientes, Populares y
  destacados en ese orden; sin resultados ofrece elegir en mapa o agregar lugar.
- Ranking regional explicable: alias de los siete municipios iniciales, respeto a geografía
  explícita, Geocoding para consultas de áreas/centros, sesgo local para consultas ambiguas.
  Identidad canónica estable y dedupe conservador por providerRef/mapping o alias explícito
  con comprobación espacial; sucursales legítimas permanecen separadas. Se conserva el
  seguimiento acotado de `discoverAction` y los journeys TomTom existentes.
- Selección manual por toque y contribución mínima con nombre, coordenada y referencia
  opcional. El aporte es `pending`, utilizable por quien lo creó, y no aparece como público.
  Gateway local con persistencia atómica, idempotencia, rate limit y área de servicio
  configurable, sin moderación ni infraestructura productiva.
- Popularidad agregada por día y región desde `place_selected` y `destination_confirmed`;
  `trip_completed` existe sólo en contrato. Queries no generan señales. Endpoint de discovery
  devuelve popular real, o vacío si aún no hay señales, y catálogo curado destacado.
  Archivo runtime ignorado por Git; dedupe actor/día en memoria con TTL, eventos idempotentes
  acotados. Al reiniciar gateway, el agregado persiste pero la dedupe de actor en memoria
  comienza de nuevo; no se guarda un historial actor→lugares.
- Controles flotantes compactos Recenter y Capas. Tráfico e Incidentes son dos preferencias
  locales independientes, ambas OFF por defecto. Fuentes/capas vectoriales nativas MapLibre
  apuntan a TomTom Orbis Traffic v2; incidentes agrupa accidentes/cierres/obras. Credencial
  de display `EXPO_PUBLIC_TOMTOM_DISPLAY_KEY` separada de `TOMTOM_API_KEY` del gateway;
  falta de display key deshabilita los toggles y no presenta datos ficticios. La clave se
  adjunta sólo a solicitudes `api.tomtom.com/maps/orbis/` mediante header nativo.
- Pins con entrada mediante transform/opacity, pulso sutil de ubicación y ruta GeoJSON con
  revelado progresivo; Reduced Motion elimina movimiento espacial/loop y muestra la ruta
  completa con fade breve. `VimaLaunchSurface` usa el lockup de splash aprobado sobre blanco
  (mismo fondo que native splash), pulso uniforme de 720 ms y salida fade/slide de 720 ms
  iniciada al estar listo el mapa. Reduced Motion: crossfade 160 ms. Native splash 183 dp intacto.
- Basemap DEV OpenFreeMap Positron sigue siendo sólo fallback cuando falta el style configurado;
  producción continúa exigiendo `EXPO_PUBLIC_MAP_STYLE_URL` explícita.

### Motion y pricing P0

- Núcleo de ubicación azul con opacity 1, anillo exterior 720 ms + descanso 1900 ms.
  El loop se cancela al perder foco/foreground o activar Reduced Motion. Pines con
  entrada/rebote 420 ms y halo breve; incidentes con transición nativa 600 ms, sin loop.
- Ruta con reveal inicial 720 ms y highlight discreto A→B cada 3800 ms. Base estable,
  índice geométrico cacheado y sólo ventana pequeña serializada por worklet; sin reroute,
  sin React por frame. Reduced Motion: ruta completa con fade, sin repetición.
- Recenter con escala/halo y confirmación sólo desde evento nativo de cámara terminada
  en la coordenada solicitada. Tap/pan cancela el feedback pendiente. Capas: transición
  240 ms (token próximo al board), switches y menú con feedback. Botones con verde Vima,
  pressed/disabled/loading; foco de field y profundidad leve del sheet, sin cambiar snaps.
- PricingEngine puro, config externa/versionada, clasificación por polígonos del servidor,
  URBANO/REGIONAL/overrides, centavos enteros y aritmética racional BigInt con redondeo final.
  Store en memoria con TTL 300 s por defecto, conflicto/idempotencia concurrente y cleanup.
- POST /v1/passenger/quotes compone Routing y Pricing. Sin tarifas/config/región válida
  conserva routePreview unpriced; fallo de ruta se distingue. Móvil usa sólo ese endpoint,
  conserva quote válida tras reconexión y pide nueva revisión tras expiración.
- Gates pricing/payment/request separados. Tener precio no activa matching live ni
  asigna Efectivo. Sin tarifas sintéticas en producción. Ver [Pricing P0](PRICING_P0.md).

### Acabado premium y media opcional P0 — 2026-10-02

- `Confirmar ubicaciones` emite una intención única de encuadrar origen, geometría completa
  y destino cuando llega una ruta válida y se mide el sheet. El fit usa el padding real del
  viewport del mapa, incluida la altura del sheet y el espacio de controles; no se dispara
  por escribir en Search. Reduced Motion mueve la cámara sin animación.
- RouteLayer añade un casing blanco debajo de la ruta Vima para separarla visualmente del
  tráfico verde; su trazo base y flujo aprobado permanecen. Recenter confirma sólo al acabar
  el movimiento nativo; el toast no bloquea toques y desaparece automáticamente en ~1 s.
  Controles y superficies usan bordes/profundidad sutiles de los tokens existentes.
- La tarjeta de incidentes traduce las categorías reales conocidas del tile Orbis y usa
  `Incidente vial` para valores desconocidos. Solicita `es-ES` a TomTom; si upstream devuelve
  una descripción en inglés no reconocible, se omite. Sólo presenta severidad disponible;
  el tile no trae una calle legible. La UI P0 nueva queda en español.
- `PlaceImageRef` lleva una referencia estable separada de `canonicalPlaceId`.
  `PlaceThumbnail` ocupa 48 px fijos en resultados, Favoritos, Recientes, Populares y Vima
  Local, con icono de categoría siempre disponible y `expo-image` para media válida, caché
  memory-disk, clave por asset/versión y reciclaje por lugar. Search/ranking no esperan imagen.
- El gateway puede cargar un manifiesto revisado desde `VIMA_PLACE_MEDIA_DIR` fuera del repo
  y servir sólo WebP `thumb.webp` asociado a un Local Place verificado mediante
  `GET /v1/media/place-images/:assetId/thumbnail`. Rechaza IDs/rutas inválidas, enlaces
  simbólicos, archivos ausentes/corruptos y versiones no coincidentes. El manifiesto guarda
  propietario, fuente, licencia, fecha, versión y atribución opcional. No hay upload ni
  fotos TomTom/Google. Ver [Media P0](PLACE_MEDIA_P0.md).
- Pricing P0 preexistente se conserva: quote autoritativa y gates independientes. La UI
  presenta el precio disponible con más jerarquía, o `Precio no disponible` sin guion
  sustituto; pago no configurado tiene presentación neutra. Sin config comercial sigue
  habiendo ruta/distancia/duración y no se habilita la solicitud live.

## VERIFICADO AUTOMÁTICAMENTE

- Dirección luminosa: suite completa 122/122; TypeScript/lint, worklets (17 archivos),
  splash y Expo Doctor 21/21 OK; exportación Hermes Android/iOS e aislamiento release/fixtures.
  Doctor necesitó acceso de red fuera del sandbox. Se conservan warnings no bloqueantes
  conocidos de Node sobre tipo de módulo y de react-test-renderer.
- Revisión visual de siete composiciones mediante proyección HTML de componentes/fixtures,
  con Inter y Material Symbols locales. No verifica Yoga, mapa ni Android real. Pendientes:
  contraste sobre Traffic ON/OFF, text scaling, teclado/safe area, panels/snaps, lectura de
  PIN/ETA/precio, estados sin precio/pago/fotos y motion/Reduced Motion en teléfono.

- Ronda de acento: TypeScript, lint, `npm test` 121/121 y worklets en 17 archivos OK.
  Pruebas de ruta verifican azul/casing sobre Traffic, geometría invariable y Reduced Motion;
  controles mantienen hit targets/feedback y media conserva icono ante error. Se inspeccionó
  una lámina de los 23 glifos renderizados desde la fuente local; no equivale a render Android.
  Exportación Hermes Android/iOS OK, incluida la fuente. El sandbox bloqueó inicialmente
  `hermesc.exe`; el reintento autorizado pasó. No se generó APK ni se ejecutó EAS.

- Tests unitarios/integración de geoespacial, ranking, dedupe, persistencia, contribuciones,
  señales, cámara Search/Recenter, clipping estructural, capas, Reduced Motion y launch surface.
- Esta ronda premium/media: `npm test` 121/121, `npm run test:gateway` 28/28,
  TypeScript y lint OK; `check:worklets`, `check:fixture-isolation`, `check:splash`,
  Expo Doctor 21/21 y exportación Hermes Android/iOS con aislamiento release OK.
  El primer Doctor y el primer Hermes export chocaron con restricciones de red/ejecutable
  del sandbox; los reintentos autorizados pasaron. `TOMTOM_API_KEY` no está disponible,
  por lo que el smoke live no se ejecutó. Tests de componentes y WebP usan dobles/fixture;
  la fidelidad visual y decodificación de fotos reales requieren Android físico.
- Validación anterior de motion/pricing: `npm test` 111/111 y `npm run test:gateway` 23/23;
  TypeScript y lint OK. Worklets transformados en 17 archivos; Expo Doctor 21/21,
  aislamiento de fixtures y pricing/servidor, check:splash y exportación Hermes
  Android/iOS OK. Expo config resuelto conserva owner, EAS projectId e identificadores.
  El primer export falló por permiso sandbox sobre `hermesc.exe`; el reintento autorizado pasó.
  Bundles sin `TOMTOM_API_KEY`, tarifas sintéticas ni paths personales/del adapter servidor.
  El export usa un temporal relativo exclusivo del proceso para que Hermes no incruste
  la ruta del perfil del desarrollador. Los tests de componentes usan
  dobles nativos; no certifican render de tiles/Fabric en un teléfono.
- La ronda premium/media anterior añadió `expo-image` y su plugin, por lo que aquel Development Build debe
  reconstruirse para comprobar miniaturas. No se generó otro APK. El resto del bloque es
  código/estilos y no modifica splash.

## VERIFICADO TOMTOM LIVE

- Evidencia anterior: Plaza, Terminal, geocoding, reverse y routing con tráfico respondieron.
  El smoke anterior de CU UAEM exigía un Discover intermedio indebido; el adapter corregido
  aún requiere repetición con `TOMTOM_API_KEY` presente en este entorno. No se preservan
  respuestas raw ni se marca cobertura nueva sin consulta real.
- En esta ronda motion/pricing se omitió el smoke live porque `TOMTOM_API_KEY` no estaba
  disponible. Los tests de gateway usan respuestas controladas, no verifican cobertura live.

## PENDIENTE ANDROID FÍSICO

- Driver location bootstrap: comprobar `Disponible → Localizando… → AVAILABLE`,
  que `/v1/driver/state` expone coordinate/receivedAt reales, el mapa centra la
  última muestra y un Passenger SEARCHING genera oferta. Verificar además permiso
  lento/denegado, watchdog sin señal, background/foreground, TTL 60 s → LOCATING
  y recovery tras restart. Automatizado; aún no probado en dos teléfonos.

- Revisar pulse con núcleo siempre opaco; ruta repetida suave sin parpadeos; controles, launch
  con mapa rápido/lento, Reduced Motion y pausa al pasar a background. Comprobar precio
  con config aprobada, preview sin config y expiración con revisión explícita.
- Confirmar que los Marker nativos no escapan de `MapViewportClip`; pan/zoom, Search lock,
  Recenter, restauración tras cancelar Search, composición de controles y teclado.
- Revisar lista local/Suggest, Favoritos/Recientes, selección manual, aporte pending,
  Reduced Motion, motion de pins/ruta y transición native splash → launch → mapa.
- Render/colores/categorías de tiles Orbis Traffic/Incidents requieren clave y cobertura live;
  tests de código no equivalen a signoff visual. Desactivar `Tools button` del Development
  Client al tomar capturas.
- Verificar en el nuevo Development Build el fit de la ruta completa con sheet y controles,
  contraste ruta/Traffic ON y OFF, toast ~1 s, controles y tarjetas en español, pulso/flujo
  con Reduced Motion y thumbnails reales cuando existan imágenes aprobadas. Los tests usan
  dobles nativos y no equivalen a validación visual/física.

## PENDIENTE ASSETS MEDIA

- No hay archivos fotográficos propios/licenciados suministrados ni entradas publicables del
  manifiesto. Los dos Local Places verificados (Plaza Atlacomulco y CU UAEM Atlacomulco),
  junto con los resultados proveedor, siguen mostrando icono de categoría. Terminal,
  mercados, hospitales y demás sólo tendrán foto tras alta/licencia y verificación propias;
  no se inventan nuevos Local Places para media.

## PENDIENTE CREDENCIAL DISPLAY / STYLE

- Proveer `EXPO_PUBLIC_TOMTOM_DISPLAY_KEY` con permisos Map Display/Traffic para validar
  capas en Android. La clave servidor `TOMTOM_API_KEY` nunca entra al bundle móvil.
- Falta aprobar el style productivo `EXPO_PUBLIC_MAP_STYLE_URL` y grosores/opacidades por zoom.
  Los trazos de tráfico de este P0 son provisionales, no signoff del mapa final.

## PENDIENTE CONFIGURACIÓN COMERCIAL

- Proveer VIMA_PRICING_CONFIG_PATH sólo al gateway, con tarifas reales aprobadas y polígonos
  municipales, version/overrides/extras explícitos. Sin esta configuración live ofrece ruta
  sin precio. No existe configuración comercial ni tarifa por defecto en el repositorio.

## PENDIENTE INFRAESTRUCTURA PRODUCTIVA

- Configurar bounds reales de servicio (`VIMA_GEO_SERVICE_AREA_BOUNDS`) para aportes. Sin
  ellos el endpoint falla explícitamente; no se inventó un polígono operativo.
- Persistencia/agregación multiinstancia, moderación de aportes, autenticación, backend productivo de
  request/matching/pagos y release siguen fuera de P0. El dedupe actor/día actual es
  únicamente de proceso; un reinicio permite una señal nueva para el mismo actor/lugar/día.
- Ampliar ground truth regional sólo con evidencia verificable. Los casos Coppel, Hospital,
  Cinemex, Bodega, centros de Ixtlahuaca/El Oro, Teatro Juárez, Presa Brockman y negativo
  Walmart requieren verificación de entidad/tipo/municipio y cobertura live antes de
  incorporarse como expectativas de smoke. No se añadieron Local Places artificiales.

[Contratos y endpoints](TOMTOM_GEOSPATIAL.md) · [ground truth comprobado](ATLACOMULCO_GROUND_TRUTH.md) ·
[diseño aprobado](design/VIMA_VISUAL_MOTION_HANDOFF_FINAL_v1.md).
