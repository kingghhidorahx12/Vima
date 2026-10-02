# TomTom geoespacial P0

Gateway Node+TS ejecutable, adapters reales y conexión móvil configurable implementados.
Verificado offline con unit/integration; revalidación live del flujo corregido pendiente de TOMTOM_API_KEY.
[Ejecución/LAN/smoke](../gateway/README.md), [ground truth/provenance](ATLACOMULCO_GROUND_TRUTH.md).

## Fronteras

VimaMap sigue usando MapLibre React Native. EXPO_PUBLIC_MAP_STYLE_URL es la única entrada de
style compatible; sin URL, DEV usa OpenFreeMap Positron y release falla explícitamente.
El style productivo Orbis Assets/Map Display sigue pendiente. El móvil reserva una credencial
de display independiente `EXPO_PUBLIC_TOMTOM_DISPLAY_KEY` para los tiles Orbis y la adjunta
como `TomTom-Api-Key` mediante TransformRequestManager limitado a
`https://api.tomtom.com/maps/orbis/`. No se reutiliza `TOMTOM_API_KEY` del gateway ni se
añade proxy de tiles. Sin display key, Tráfico/Incidentes permanecen deshabilitados.

createGeospatialClient → ApiClient → gateway Vima → adapter TomTom. La app recibe Coordinate,
Bounds, GeoJSON y modelos Vima, nunca raw provider. HTTPS obligatorio, con excepción HTTP
privada sólo DEV sin credenciales de usuario para Android físico local. No hay auth P0;
un backend productivo autenticado queda fuera de esta iteración.

## Contrato Vima conservado

| Endpoint | Request | Response |
| --- | --- | --- |
| POST /v1/geospatial/places/sessions | vacío | {sessionId} |
| POST .../sessions/{id}/autocomplete | {input,bias?} | {suggestions:PlaceSuggestion[]} |
| POST .../sessions/{id}/search | {input,bias?} | {suggestions:PlaceSuggestion[]} |
| POST .../sessions/{id}/follow-up | {id,bias?} | {suggestions:PlaceSuggestion[]} |
| POST .../sessions/{id}/resolve | {id} | ResolvedPlace |
| DELETE .../sessions/{id} | vacío | {} |
| POST /v1/geospatial/geocode | {input,bias?} | {result:ResolvedPlace\|null} |
| POST /v1/geospatial/reverse-geocode | {coordinate} | {result:ResolvedPlace\|null} |
| POST /v1/geospatial/routes | {origin,destination,stops} | RouteResult |
| GET /v1/geospatial/discovery?regionId=... | región permitida | {popular,featured} |
| POST /v1/geospatial/place-signals | señal validada, sin query/coordenada | {accepted} |
| POST /v1/geospatial/place-contributions | nombre, coordenada, referencia opcional | lugar pending privado |
| GET /health | sin parámetros | {status,configured} |

Bias opcional es una extensión compatible [lng,lat]. PlaceSuggestion conserva id, name,
address, provenance/category/regionId opcionales. `kind: action` distingue una acción de
descubrimiento de un destino seleccionable; nunca lleva `more` ni payload TomTom. ResolvedPlace añade coordinate.
Municipalidad se representa en address y regionId cuando pertenece a la región conocida,
sin payloads administrativos raw. RouteResult conserva geometry, bounds, distanceMeters,
durationSeconds y trafficDurationSeconds.

## Adapter real y documentación consultada

Origen upstream fijo https://api.tomtom.com. Key/version/Attributes en headers, idioma es-MX.
No se acepta URL upstream del cliente. Documentación consultada el 2026-10-02:

| Web service | Método/path | Parámetros |
| --- | --- | --- |
| Search v3 [Suggest](https://docs.tomtom.com/places-search-api/documentation/places-search/suggest) / [Discover](https://docs.tomtom.com/places-search-api/documentation/places-search/discover) | POST /maps/orbis/places/suggest y /discover | Query, MX, tipos seleccionables; origin y preferences.geometry como bias opcionales, sin radio restrictivo. |
| Search v3 [Details](https://docs.tomtom.com/places-search-api/documentation/places-search/details) | GET /maps/orbis/places/details/{type}/{id} | Tipos permitidos; ID provider detrás de handle de selección Vima. |
| [Geocoding v2](https://docs.tomtom.com/geocoding-api/documentation/tomtom-orbis-maps/v2/geocode) | GET /maps/orbis/places/geocode | query, MX, maxResults1, position opcional; direcciones. |
| [Reverse v2](https://docs.tomtom.com/reverse-geocoding-api/documentation/tomtom-orbis-maps/v2/reverse-geocode) | GET /maps/orbis/places/reverseGeocode | position lng,lat; sin geocoder del dispositivo en live. |
| [Routing v3](https://docs.tomtom.com/routing-api/documentation/tomtom-orbis-maps/v3/calculate-route) | POST /maps/orbis/routing/routes/calculate | routePlanningLocations Point/MultiPoint, travelMode car, traffic live, maxPathAlternativeRoutes0. |

Sólo campos usados mediante Attributes. Duration sin tráfico = travelDurationInSeconds menos
trafficDelayDurationInSeconds (delay respecto a free flow); trafficDurationSeconds conserva
duración live. RouteLayer consume GeoJSON Vima. Pruebas offline no certifican cobertura live.

## Sesiones, errores y cliente

UUID v4, createdAt/lastActivity, TTL operacional DEV configurable, cleanup/memoria acotados.
Suggest → Details, Discover → Details y Suggest discoverAction → Discover → Details comparten
Session-Id. La selección de un POI sugerido no exige Discover intermedio. Resolver, salir o cambiar
de campo cierra la sesión. El debounce móvil vigente es 200 ms (antes 250 ms), con timeout de 15 s;
requests obsoletos se cancelan/ignoran. La resolución tardía se invalida
al cambiar query o desmontar pantalla. GPS permanece válido aunque reverse falle; no sustituye
origen manual. La selección por toque en mapa llama Reverse cuando puede y conserva la
coordenada seleccionada si falla el lookup.

Validación estricta de campos/coordenadas/query/paradas/cuerpo, timeout abortable, rate limit
y errores sanitizados {error:{code}}. No_result404, invalid_result400, timeout504, cancelled499,
indisponibilidad503, límite429. No fallback de live a fixtures ni a catálogo local si falla upstream.
Logging estructurado desactivable, sin secretos/direcciones/coordenadas.

## Búsqueda local, ranking y Local Places

El SearchCoordinator combina Favoritos, Recientes, catálogo curado y cache en memoria de forma
inmediata; Suggest actualiza una sola lista tras 200 ms, con generación monotónica y AbortController.
No vacía coincidencias útiles durante refresh. Al borrar query vuelve al estado vacío sin
solicitar una lista genérica TomTom. `discoverAction` se sigue como máximo una vez si se
necesita materializar resultados. Las consultas de centros/municipios consideran Geocoding.

rankRegionalPlaces prioriza match de entidad/tipo antes de localidad. Sin municipio explícito,
Atlacomulco/región inicial sesgan consultas ambiguas; con geografía escrita se respeta ese
municipio. Sin pesos ML, radio inventado ni exclusión intermunicipal. rankingReason explica
el resultado y el proveedor preserva su orden dentro de buckets equivalentes.

Región: Atlacomulco, Jocotitlán, San Felipe del Progreso, El Oro, Acambay, Ixtlahuaca, Temascalcingo.
Dedupe por ID/proveedor o mapping conocido y alias explícito más comprobación espacial;
nombre parecido y proximidad por sí solos no fusionan sucursales. IDs TomTom Vima estables
sin persistir payload raw. El catálogo curado de Plaza y CU UAEM Atlacomulco se comparte
con el móvil; no se añadieron lugares para simular cobertura del proveedor.

Favoritos y últimos 16 destinos confirmados usan documentos versionados de SQLite/KV.
Las consultas tecleadas y resultados vistos no se guardan. Contribuciones de nombre y punto
de mapa quedan `pending`, sirven inmediatamente a su autor y no entran a discovery público.
El gateway exige bounds de servicio configurados para aceptarlas y persiste JSON atómico
en `.runtime/` ignorado por Git.

Señales válidas: `place_selected`, `destination_confirmed`, `trip_completed`; esta última
no se emite en P0. El gateway valida esquema/región/id canónico, limita tasa e idempotencia,
agrega por lugar/región/día y muestra sólo entidades verificadas. No almacena query, ubicación
del actor ni historial actor→lugares. El dedupe actor/lugar/tipo/día dura 24 h en memoria;
un reinicio reinicia esa dedupe aunque conserva agregados, limitación P0 explícita.

## Traffic tiles y mapa

Dos capas vectoriales nativas MapLibre, OFF por defecto y persistidas localmente. Tráfico usa
`Traffic flow` y `relative_speed`/`road_closure`; Incidentes usa `Traffic incident flow` y
`Traffic incident points`, con `icon_category_0` para distinguir casos dentro de un único
control. No se implementa Incident Details. URLs y source-layers se cotejaron con
[Vector Flow Tiles Orbis v2](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-flow/vector-flow-tiles)
y [Vector Incident Tiles Orbis v2](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-incidents/vector-incident-tiles)
el 2026-10-02. Ambas APIs documentan el header `TomTom-Api-Key` para autenticación. El style
productivo, grosores por zoom y render físico siguen pendientes.

## Límite Passenger

La misma pantalla/shell/mapa usa sugerencias → Details → routing real. RideQuote admite price y
paymentMethod ausentes para vista previa; canRequest exige ambos. No se finge cotización, pago,
matching. Los recientes existen sólo tras confirmación real del destino. Solicitar viaje queda
deshabilitado en live P0. Fixtures explícitos DEV mantienen flujo completo. Release conserva su entry
no habilitado: se valida Android con Development Client, no se publica un producto incompleto.
