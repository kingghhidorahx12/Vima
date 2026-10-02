# TomTom geoespacial P0

Gateway Node+TS ejecutable, adapters reales y conexión móvil configurable implementados.
Verificado offline con unit/integration; **TomTom live pendiente de TOMTOM_API_KEY**.
[Ejecución/LAN/smoke](../gateway/README.md), [ground truth/provenance](ATLACOMULCO_GROUND_TRUTH.md).

## Fronteras

VimaMap sigue usando MapLibre React Native. EXPO_PUBLIC_MAP_STYLE_URL es la única entrada de
style compatible; sin URL, DEV usa OpenFreeMap Positron y release falla explícitamente.
Orbis Assets/Map Display y su posible credencial cliente separada siguen pendientes. No se
expone ni reutiliza la key servidor ni se añade proxy de tiles.

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
| POST .../sessions/{id}/resolve | {id} | ResolvedPlace |
| DELETE .../sessions/{id} | vacío | {} |
| POST /v1/geospatial/geocode | {input,bias?} | {result:ResolvedPlace\|null} |
| POST /v1/geospatial/reverse-geocode | {coordinate} | {result:ResolvedPlace\|null} |
| POST /v1/geospatial/routes | {origin,destination,stops} | RouteResult |
| GET /health | sin parámetros | {status,configured} |

Bias opcional es una extensión compatible [lng,lat]. PlaceSuggestion conserva id, name,
address, provenance/category/regionId opcionales; ResolvedPlace añade coordinate.
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
Search/Details comparten Session-Id; resolver o salir/cambiar campo cierra sesión. Debounce250ms
y timeout15s centralizados; requests obsoletos cancelados/ignorados. Resolución tardía invalidada
al cambiar query o desmontar pantalla. GPS permanece válido aunque reverse falle; no sustituye
origen manual. Reverse queda disponible para coordenadas manuales: **no se añade UI de selección
por toque en mapa**, inexistente en la base; la edición actual sigue siendo textual.

Validación estricta de campos/coordenadas/query/paradas/cuerpo, timeout abortable, rate limit
y errores sanitizados {error:{code}}. No_result404, invalid_result400, timeout504, cancelled499,
indisponibilidad503, límite429. No fallback de live a fixtures ni a catálogo local si falla upstream.
Logging estructurado desactivable, sin secretos/direcciones/coordenadas.

## Ranking y Local Places

rankRegionalPlaces puro: nombre exacto → prefijos de título → dirección → resto del proveedor;
dentro de ese orden: coincidencia local explícita → Atlacomulco → región inicial → resto.
Conserva orden provider dentro del bucket. Sin pesos, distancias inventadas o exclusión
intermunicipal. rankingReason explica el resultado.

Región: Atlacomulco, Jocotitlán, San Felipe del Progreso, El Oro, Acambay, Ixtlahuaca, Temascalcingo.
Dedupe por identidad/name+address y alias+región entre provider/local, favoreciendo provider.
Catálogo separado en gateway/places.ts: Plaza y CU UAEM Atlacomulco. VimaLocalPlace reutilizado
con aliases opcionales. mergePlaces y su política anterior permanecen compatibles, sin activar
pesos. El array móvil approvedLocalPlaces sigue vacío: el catálogo sólo reside en servidor.

## Límite Passenger

La misma pantalla/shell/mapa usa sugerencias → Details → routing real. RideQuote admite price y
paymentMethod ausentes para vista previa; canRequest exige ambos. No se finge cotización, pago,
reciente personal o matching. Solicitar viaje queda deshabilitado en live P0. Fixtures explícitos
DEV mantienen flujo completo. Layout/estados/motion no se rediseñan. Release conserva su entry
no habilitado: se valida Android con Development Client, no se publica un producto incompleto.
