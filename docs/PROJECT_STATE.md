# Estado real del proyecto

Actualizado 2026-10-02 en `codex/local-search-map-motion-p0`, creada desde
`codex/tomtom-live-atlacomulco-p0` (`1570e7a`). No se modificó la rama base.

## IMPLEMENTADO

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
  completa con fade breve. `VimaLaunchSurface` usa el app icon aprobado sobre carbón y sale
  cuando el mapa queda listo, sin espera artificial. Native splash Android 183 dp permanece.
- Basemap DEV OpenFreeMap Positron sigue siendo sólo fallback cuando falta el style configurado;
  producción continúa exigiendo `EXPO_PUBLIC_MAP_STYLE_URL` explícita.

## VERIFICADO AUTOMÁTICAMENTE

- Tests unitarios/integración de geoespacial, ranking, dedupe, persistencia, contribuciones,
  señales, cámara Search/Recenter, clipping estructural, capas, Reduced Motion y launch surface.
- 90/90 tests de suite completa y 12/12 gateway; TypeScript y lint OK. Worklets nuevos
  transformados; Expo Doctor 21/21, aislamiento de fixtures, check:splash y exportación Hermes
  Android/iOS OK. Expo config resuelto conserva owner, EAS projectId e identificadores.
  El primer export falló por permiso sandbox sobre `hermesc.exe`; el reintento autorizado pasó.
  Bundles sin `TOMTOM_API_KEY` ni paths del adapter servidor. Los tests de componentes usan
  dobles nativos; no certifican render de tiles/Fabric en un teléfono.
- Este bloque sólo cambia TypeScript/JS, docs y `.env.example`: no agrega dependencia/plugin
  nativo ni cambia splash. Un Development Build que ya incorpore la base `1570e7a` puede
  cargarlo con Metro; un APK anterior al ajuste nativo de splash 183 dp sí requiere reconstrucción.

## VERIFICADO TOMTOM LIVE

- Evidencia anterior: Plaza, Terminal, geocoding, reverse y routing con tráfico respondieron.
  El smoke anterior de CU UAEM exigía un Discover intermedio indebido; el adapter corregido
  aún requiere repetición con `TOMTOM_API_KEY` presente en este entorno. No se preservan
  respuestas raw ni se marca cobertura nueva sin consulta real.

## PENDIENTE ANDROID FÍSICO

- Confirmar que los Marker nativos no escapan de `MapViewportClip`; pan/zoom, Search lock,
  Recenter, restauración tras cancelar Search, composición de controles y teclado.
- Revisar lista local/Suggest, Favoritos/Recientes, selección manual, aporte pending,
  Reduced Motion, motion de pins/ruta y transición native splash → launch → mapa.
- Render/colores/categorías de tiles Orbis Traffic/Incidents requieren clave y cobertura live;
  tests de código no equivalen a signoff visual. Desactivar `Tools button` del Development
  Client al tomar capturas.

## PENDIENTE CREDENCIAL DISPLAY / STYLE

- Proveer `EXPO_PUBLIC_TOMTOM_DISPLAY_KEY` con permisos Map Display/Traffic para validar
  capas en Android. La clave servidor `TOMTOM_API_KEY` nunca entra al bundle móvil.
- Falta aprobar el style productivo `EXPO_PUBLIC_MAP_STYLE_URL` y grosores/opacidades por zoom.
  Los trazos de tráfico de este P0 son provisionales, no signoff del mapa final.

## PENDIENTE INFRAESTRUCTURA PRODUCTIVA

- Configurar bounds reales de servicio (`VIMA_GEO_SERVICE_AREA_BOUNDS`) para aportes. Sin
  ellos el endpoint falla explícitamente; no se inventó un polígono operativo.
- Persistencia/agregación multiinstancia, moderación de aportes, autenticación, backend de
  cotización/matching/pagos y release siguen fuera de P0. El dedupe actor/día actual es
  únicamente de proceso; un reinicio permite una señal nueva para el mismo actor/lugar/día.
- Ampliar ground truth regional sólo con evidencia verificable. Los casos Coppel, Hospital,
  Cinemex, Bodega, centros de Ixtlahuaca/El Oro, Teatro Juárez, Presa Brockman y negativo
  Walmart requieren verificación de entidad/tipo/municipio y cobertura live antes de
  incorporarse como expectativas de smoke. No se añadieron Local Places artificiales.

[Contratos y endpoints](TOMTOM_GEOSPATIAL.md) · [ground truth comprobado](ATLACOMULCO_GROUND_TRUTH.md) ·
[diseño aprobado](design/VIMA_VISUAL_MOTION_HANDOFF_FINAL_v1.md).
