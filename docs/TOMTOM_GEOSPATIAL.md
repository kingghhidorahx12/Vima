# TomTom geoespacial P0: contrato de integración

Estado: MapLibre móvil activo y adaptador móvil Vima preparado. **No hay backend TomTom ni integración live verificada** en este repositorio.

## Mapa

`VimaMap` usa MapLibre React Native. `EXPO_PUBLIC_MAP_STYLE_URL` es la única entrada de style: debe apuntar al style MapLibre compatible publicado por TomTom Orbis Assets/Map Display cuando se aprueben URL, alcance de key y estilo final. En desarrollo sin URL se usa OpenFreeMap Positron únicamente para verificar composición; release falla explícitamente. No se incluye un key ni una URL productiva en el código. El style y sus referencias a tiles/sprites/glyphs requieren configuración real y validación Android. [Orbis Map Display](https://docs.tomtom.com/map-display-api/documentation/tomtom-orbis-maps/v1/product-information/introduction), [Assets API](https://docs.tomtom.com/assets-api/documentation/tomtom-orbis-maps/product-information/introduction).

El renderer recibe únicamente `Coordinate`, `Bounds`, `CameraTarget`, GeoJSON Vima y apariencias neutrales. Los layers nativos traducen internamente esos modelos. El mapa/shell se mantienen montados entre fases; expo-location conserva autoridad del punto de usuario. La cámara respeta padding del sheet y Reduced Motion. No se decide aquí el comportamiento tras pan manual.

## Backend requerido

`createGeospatialClient` utiliza `ApiClient` autenticado hacia un origen HTTPS de Vima. No hay servidor en este repo: los endpoints siguientes son el contrato que debe implementar el backend, no servicios activos. La app no llama a web-services TomTom ni guarda respuestas raw.

| Endpoint Vima | Request | Response normalizada | Adaptador servidor previsto |
| --- | --- | --- | --- |
| `POST /v1/geospatial/places/sessions` | cuerpo vacío | `{sessionId:string}` | Session-Id opaco compatible con flujo Search v3 |
| `POST .../sessions/{id}/autocomplete` | `{input:string}` | `{suggestions:PlaceSuggestion[]}` | Places Search v3 Suggest |
| `POST .../sessions/{id}/search` | `{input:string}` | `{suggestions:PlaceSuggestion[]}` | Places Search v3 Discover |
| `POST .../sessions/{id}/resolve` | `{id:string}` | `ResolvedPlace` | Places Search v3 Details; cerrar handle Vima |
| `DELETE .../sessions/{id}` | sin cuerpo | respuesta vacía | Cancelar/cerrar sesión Vima |
| `POST /v1/geospatial/geocode` | `{input:string}` | `{result:ResolvedPlace|null}` | Geocoding v2, sólo direcciones |
| `POST /v1/geospatial/reverse-geocode` | `{coordinate:[lng,lat]}` | `{result:ResolvedPlace|null}` | Reverse Geocoding v2 |
| `POST /v1/geospatial/routes` | `{origin,destination,stops}` en coordenadas Vima | `RouteResult` | Routing v3, `travelMode: car`, tráfico `live` |

`PlaceSuggestion` expone id, nombre, dirección y sólo cuando proceda provenance (`provider`/`vima-local`), categoría y región. `ResolvedPlace` añade coordenada. `RouteResult` expone geometry GeoJSON LineString/MultiLineString, bounds, distanceMeters, durationSeconds y trafficDurationSeconds cuando exista. El backend traduce payloads TomTom y responde errores semánticos Vima: map/search/geocoding/route unavailable, timeout, network recoverable, invalid/no result. El cliente valida estos campos y descarta propiedades adicionales. No se permite inferir una ruta/cotización exitosa a partir de respuesta incompleta.

El backend debe custodiar la credencial TomTom, validar entradas, autenticar llamadas Vima, aplicar límites de tasa/políticas, timeout y cierre de sesiones, y normalizar respuestas/errores. Las llamadas Orbis correspondientes usan cabeceras de versión/key/Attributes según la documentación vigente; el `Session-Id` de Search v3 se conserva a través de Suggest/Discover/Details. El tráfico live debe solicitarse al calcular rutas, sin sustituir rutas autoritativas con fixtures. [Places Search v3](https://docs.tomtom.com/places-search-api/documentation/places-search/discover), [Geocoding v2](https://docs.tomtom.com/geocoding-api/documentation/tomtom-orbis-maps/v2/geocode), [Reverse Geocoding v2](https://docs.tomtom.com/reverse-geocoding-api/documentation/tomtom-orbis-maps/v2/reverse-geocode), [Routing v3](https://docs.tomtom.com/routing-api/documentation/tomtom-orbis-maps/v3/calculate-route).

## Ranking regional y lugares locales

`mergePlaces` une resultados provider y `VimaLocalPlace` por id/provenance sin excluir municipios. Mantiene el orden original si no recibe política. `RegionalRankingPolicy` recibe origen, región inicial, regiones cercanas y pesos explícitos de distancia por km/bonos regionales. **No hay pesos, radios, lista de municipios cercanos ni POI productivos aprobados**; por ello la lista `approvedLocalPlaces` está vacía y no existe scoring productivo por defecto. Atlacomulco es la región inicial decidida; su identificador técnico y sus datos se deben validar antes de activar ranking. Los fixtures DEV nunca se promueven automáticamente.

El gateway P0 actual sigue en modo fixture DEV; la conexión live a PassengerGateway, el estilo productivo TomTom, las credenciales/backend y el signoff en Android físico quedan pendientes. Un nuevo Development Build es necesario al retirar el módulo nativo de Google Maps.
