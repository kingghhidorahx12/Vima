# Estado real del proyecto

Actualizado 2026-10-04 en `codex/passenger-shell-route-autofit-p0`, desde el HEAD publicado
`b2a9c11` de `codex/premium-media-pricing-p0`. Sin reset ni merge a main.

## IMPLEMENTADO

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
