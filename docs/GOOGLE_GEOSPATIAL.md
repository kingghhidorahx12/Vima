# Google geoespacial Android P0

Estado: implementación móvil preparada; **sin signoff Google en Android físico y sin backend live**.
La rama parte del checkpoint `4bbcd7d`. No se ejecutó EAS Build.

## Dependencia y configuración

`npx expo install react-native-maps` instaló **1.27.2**, la versión recomendada por el
[catálogo Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/).
Su [matriz Fabric](https://github.com/react-native-maps/react-native-maps/blob/v1.27.2/README.md)
requiere RN >= 0.81.1; el proyecto usa RN 0.86.3, Hermes y New Architecture.
La resolución de dependencias y el prebuild no sustituyen ejecutar Fabric en un teléfono.

- Build/config: `GOOGLE_MAPS_ANDROID_API_KEY` → `android.config.googleMaps.apiKey`.
  Restringir a **Maps SDK for Android**, package **com.kingghhidorahx12.vima** y SHA-1
  del certificado que firma el APK instalado. Obtener el SHA-1 de las credenciales Android
  del proyecto EAS; el valor no se conoce ni se inventa en esta tarea.
- El plugin local `scripts/with-google-maps.cjs` llama al plugin oficial leyendo ese campo.
  Evita serializar la key en opciones públicas de plugins. `extra` contiene sólo el booleano
  `googleMapsAndroidConfigured`; el valor SDK reside en el manifest nativo, nunca en constantes TS.
- Inyectar la key desde el entorno EAS y, para Metro local, un entorno local o `.env` ignorado.
  El config que sirve Metro debe tener la misma disponibilidad de key que el build.
  Cambiar la key nativa exige reconstruir; cambiar únicamente el Map ID no añade una librería nativa.
- `EXPO_PUBLIC_GOOGLE_MAP_ID` es opcional/no secreto. Sin ID se usa Google estándar.
  El style Vima en Google Cloud sigue **pendiente**.
- Android configurado usa `PROVIDER_GOOGLE`. DEV sin key avisa en consola de desarrollo y
  conserva MapLibre. Android release sin key falla explícitamente al resolver el mapa.
  No se hace fallback automático por un fallo de autenticación/carga Google.
- iOS conserva MapLibre; esta tarea no migra iOS a Google ni configura una key iOS.
- Rollback temporal Android: retirar la key del entorno local de config y reiniciar Metro DEV.
  Para reproducir exactamente el estado anterior está el checkpoint; no se ha eliminado MapLibre.
  `EXPO_PUBLIC_MAP_STYLE_URL`, Positron DEV y el header MapTiler sólo afectan al camino legacy.

La configuración actual no contiene una key Maps real ni Map ID. Un nuevo Development Build
es obligatorio por la dependencia nativa; **no se ha generado un APK**.

## Adaptación y límites

`src/map/models.ts` define Coordinate ([longitud, latitud]), Bounds (incluido cruce del
antimeridiano), CameraTarget y apariencia numérica Vima. Las features no importan SDKs de mapas.
GeoJSON sigue siendo el formato interno de ruta; nunca una respuesta raw Google.

- `VimaMap` conserva una instancia por shell. Gestos y teclado conservan sus callbacks.
- `Camera` aplica set/animate/fit y padding medido del sheet. No duplica padding en fit.
  Sin motion aprobado o con Reduced Motion usa cambios inmediatos. Google usa su easing nativo:
  no hay API para reproducir el easing MapLibre en animateCamera. El P0 actual no solicita
  animación de cámara. Fit nativo tampoco admite duración personalizada.
- El adaptador DEV encuadra la geometría completa cuando existe ruta y centra origen en Inicio.
  No se añadió recentrado continuo después de pan; esa regla sigue pendiente de UX.
- RouteLayer usa Polyline, conserva color/ancho/opacidad/cap/join y draw/fade aprobado.
  Cada tramo desconectado permanece separado; el reveal se calcula sobre la geometría completa.
- MapMarker conserva el artwork actual de origen/destino/usuario. expo-location sigue siendo
  la autoridad del origen; no se activa una segunda ubicación Google.
- VehicleLayer conserva useVehicleMotion a 12 Hz, posición/heading, snap por reconexión,
  Reduced Motion y criterio de salto inyectado. Sólo monta/desmonta React al aparecer/desaparecer
  un vehículo; las poses se despachan a métodos nativos. El círculo DEV actual rota pero no
  tiene orientación visual distinguible: el asset de vehículo aprobado sigue pendiente.
  No se añadieron conductores ni thresholds nuevos.
- Google onMapReady habilita el control nativo, **no** certifica carga de tiles.
  onMapLoaded notifica éxito a la UI. Tras 15 s sin tiles, el callback existente de fallo muestra
  el estado de mapa no disponible. Es un deadline técnico de carga, no motion.
  Una carga posterior recupera el estado. RN Maps no expone al JS el error de autorización del
  SDK Android; el diagnóstico físico debe comprobar permisos de key/SHA-1.
- `src/map/legacy/` retiene los componentes MapLibre para paridad/rollback. No es una nueva
  plataforma multiproveedor permanente. No hay cambios de matching, routing, gateways de
  viajes, Visual System, Motion System ni composición del P0.

## Backend requerido (contrato propuesto e implementado sólo del lado móvil)

No existe un servidor en este repositorio. `src/services/geospatial/client.ts` recibe el
ApiClient HTTPS Vima existente y un timeout técnico explícito. No hay URL de servidor
inventada, conexión live ni llamadas móviles a Google. El adaptador está preparado pero no
sustituye al PassengerGateway de fixtures.

Todas las rutas siguientes son **requisitos para el futuro backend**, no endpoints desplegados.
Usan autenticación Vima del ApiClient, no keys Google del teléfono. JSON, sin caché persistente.
Las coordenadas del protocolo son siempre [longitud, latitud].

| Método/ruta | Request | Response 200 |
| --- | --- | --- |
| POST /v1/geospatial/places/sessions | sin body | `{sessionId: string}` opaco |
| POST /v1/geospatial/places/sessions/:sessionId/autocomplete | `{input: string}` | `{suggestions: [{id, name, address}]}` |
| POST /v1/geospatial/places/sessions/:sessionId/resolve | `{id: string}` seleccionado | `{id, name, address, coordinate: [lng, lat]}` |
| DELETE /v1/geospatial/places/sessions/:sessionId | sin body | `{}` (200, no 204) |
| POST /v1/geospatial/routes | `{origin: [lng, lat], destination: [lng, lat], stops: [[lng, lat], ...]}` | RouteResult debajo |

RouteResult:

```ts
{
  geometry: {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: number[][] }
      // MultiLineString permitido para tramos realmente desconectados.
  },
  bounds: { southwest: [longitude, latitude], northeast: [longitude, latitude] },
  distanceMeters: number,
  durationSeconds: number,        // staticDuration sin tráfico
  trafficDurationSeconds?: number // duration con tráfico
}
```

El cliente valida coordenadas, bounds/contenimiento, geometría, números finitos/no negativos
y campos obligatorios. Reconstruye una allowlist; descarta propiedades y objetos extra.
No convierte la ruta en tarifa/cotización de viaje: precio, pago, request, matching y cancelación
siguen necesitando su backend autoritativo.

### Places API (New)

El servidor requiere `GOOGLE_PLACES_API_KEY`, separado/restringido a Places API (New).
Genera un token único por sesión (UUID v4), lo asocia al sessionId Vima y al usuario autenticado.
Reutiliza ese token en Autocomplete (New), y lo termina con Place Details (New) al seleccionar.
El cliente cierra su sesión al intentar resolve incluso ante respuesta ambigua; no recicla tokens.
Cancelar cierra el handle sin fabricar una selección; el servidor debe expirar sesiones abandonadas.
No registrar input, dirección, token ni respuesta raw en logs/analytics.

Field masks mínimos previstos:
- Autocomplete: `suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat`.
- Details: `id,displayName,formattedAddress,location`.

La UI P0 actual consume Place resuelto. Conectar live requerirá resolver la sugerencia seleccionada
antes de entregarla al boundary actual, con una sesión por edición de campo, sin pedir Details
para todos los resultados. Esa conexión permanece pendiente junto con el backend, no se simula.
[Contrato de sesiones oficial](https://developers.google.com/maps/documentation/places/web-service/using-session-tokens).

### Routes API

El servidor requiere `GOOGLE_ROUTES_API_KEY`, independiente/restringida a Routes API.
Compute Routes con `travelMode: DRIVE`, `routingPreference: TRAFFIC_AWARE`, origen/destino/paradas
validados server-side. Field mask:
`routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline`.
Decodificar polyline, convertir segundos, derivar bounds y devolver sólo RouteResult.
No se envían objetos Google, polyline raw ni una key a la app.
[Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions),
[field masks](https://developers.google.com/maps/documentation/routes/choose_fields).

El servidor futuro debe imponer autorización, cuotas/rate limiting, límites de input/paradas,
timeouts y restricciones de credenciales según su infraestructura. No se creó una plataforma
backend alternativa para esta migración.

### Fallos

No devolver 200 con éxitos ficticios. Usar HTTP de error; el adaptador convierte 408/504 en
timeout, errores de red en network_recoverable, otros fallos de búsqueda/ruta en
search_unavailable/route_unavailable, cancelación en cancelled, y datos inválidos en invalid_result.
No pasa mensajes raw a UI, logs o storage. Map unavailable usa el callback UI existente.
Los errores y sugerencias sólo permanecen en memoria; no se añadió persistencia.

## Validación y signoff pendiente

Scripts reproducibles:
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:worklets`.
- `node scripts/check-google-config.cjs`: key desde env, config público limpio, identidad conservada.
- `node scripts/check-google-native.cjs`: prebuild Android con marcador sintético de prueba,
  comprueba metadata y permisos; vuelve a prebuild con entorno real para retirar el marcador.
  Nunca imprime claves ni crea APK.
- `npm run doctor`, `npm run export:native`, `npm run check:fixture-isolation`.

Los dobles nativos verifican props, comandos, persistencia y ausencia de renders por pose;
no certifican bitmap de markers, ejecución de animatedProps en Fabric, tiles, autenticación ni FPS.
Antes de retirar MapLibre se requiere Android físico con key restringida y nuevo APK:
mapa/atribución, cámara y fit/padding, origen/destino/usuario, ruta draw/fade, vehículo y heading
cuando exista asset, reconexión/saltos/Reduced Motion, ubicación/permisos, pan/gestos/teclado,
Inicio → selección → confirmación → matching, y revisión de ambos caminos para paridad.
Tools del Development Client se oculta desde su preferencia. Style Google Cloud,
backend Places/Routes y credenciales de servidor siguen pendientes.
