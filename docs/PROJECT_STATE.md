# Estado real del proyecto

Fecha: 2026-10-01. Repositorio: `kingghhidorahx12/Vima`.
Rama de trabajo: `codex/google-geospatial-android-p0`.
El P0 previo quedó preservado en el checkpoint `4bbcd7d`, publicado en
`origin/codex/vima-p0-bootstrap`. No se modificó main ni se reescribió historia.

## DECIDIDO

- Google Maps SDK mediante react-native-maps/PROVIDER_GOOGLE es el objetivo Android.
- Places API (New) y Routes API son exclusivamente backend; Routes usará DRIVE/TRAFFIC_AWARE.
- Modelos Vima independientes del proveedor. MapLibre permanece transitorio hasta paridad física.
- Google Cloud styling sustituye la dirección productiva MapTiler anterior, que queda histórica.
  No se eligió un Map ID ni un nuevo estilo final.
- Conservar composición y lógica del P0, Visual/Motion System, expo-location, shell y sheet.

## IMPLEMENTADO

- react-native-maps **1.27.2**, instalado con Expo SDK 57; RN 0.86.3/Hermes/New Architecture.
- Key Maps SDK Android inyectada desde `GOOGLE_MAPS_ANDROID_API_KEY` a
  `android.config.googleMaps.apiKey`. Plugin oficial aplicado mediante puente local que impide
  serializar la key en opciones públicas. Extra sólo contiene un booleano de disponibilidad.
  Owner, projectId, package, iconos, splash y permisos de ubicación conservados.
- Google por defecto Android cuando está configurado; `EXPO_PUBLIC_GOOGLE_MAP_ID` opcional.
  Sin ID: mapa Google estándar. Sin key: DEV advierte y usa MapLibre temporal; release Android
  falla explícitamente. No se hace fallback silencioso si Google falla.
- MapView persistente, Camera set/animate/fit con padding de sheet, Reduced Motion inmediato,
  Polyline con colores/reveal/fade vigentes, pines origen/destino/usuario con el mismo artwork,
  vehículo con pose/heading y salida nativa desde el loop existente de 12 Hz sin React por frame.
  El fixture de ruta usa fit de geometría completa; Inicio mantiene centro de origen.
  No hay regla nueva de auto-recenter después de pan.
- Features sin imports/tipos raw de SDK. Coordinate/Bounds/CameraTarget y apariencias Vima.
  Componentes MapLibre preservados en `src/map/legacy/`; URL/Positron DEV y header MapTiler
  siguen disponibles sólo en ese camino y en iOS.
- Contratos y adaptadores móviles Places/Routes: sesiones opacas, autocomplete/resolve/cierre,
  ruta normalizada, validación de coordenadas/bounds/geometría/métricas, timeout/cancelación/
  errores semánticos; sin keys, URLs ni respuestas Google raw en móvil. No se creó backend.
  Endpoints exactos requeridos en [GOOGLE_GEOSPATIAL.md](GOOGLE_GEOSPATIAL.md).
- No se conectó artificialmente el adaptador al PassengerGateway: búsqueda, cotización,
  matching/cancelación siguen siendo fixtures DEV; expo-location sí consulta el dispositivo.
  Release mantiene aislamiento de fixtures y no presenta servicios inexistentes.

## VERIFICADO LOCALMENTE

- Resolución: expo 57.0.26, RN 0.86.3, react-native-maps 1.27.2. Matriz Fabric compatible;
  Expo Doctor **21/21**.
- TypeScript y lint **OK**. **46/46 tests**, incluidos los 37 P0 previos. Nuevos tests de
  selección Android/release, Map ID opcional, límites de coordenadas/bounds, cámara/fit/
  Reduced Motion, mapa persistente, Polyline/pines, comandos nativos de vehículo sin renders
  por pose, sesiones/normalización/timeouts y separación de tipos/credenciales.
- Worklets **16 módulos OK**.
- Config Expo resuelto: inyección por env, configuración pública sin key, identidad Expo/EAS
  conservada y ausencia de key soportada sin inventar valores.
- Android prebuild: metadata Maps recibida desde env con un marcador sintético de test;
  permisos foreground preservados, sin background location. Segundo prebuild restaura
  configuración real y elimina el marcador. `android/` sigue ignorado.
- Bundles Hermes release Android/iOS **OK**. Fixture isolation **OK** en ambos.
  Export DEV Android **OK** con P0 y fixtures presentes; bundles DEV/release sin keys de servidor ni endpoints Google Places/Routes.
- Instalación npm informó 17 advisories (12 moderados, 5 altos) en el árbol completo;
  no se aplicaron upgrades ajenos a la migración.
- Los tests de SDK usan dobles nativos: no certifican tiles, bitmap de pines, animatedProps
  en Fabric, FPS, API key/SHA-1 ni render físico. **Google NO está verificado en Android físico**.

## PENDIENTE

- Key Maps Android real, restringida a Maps SDK Android + `com.kingghhidorahx12.vima` +
  SHA-1 del certificado del APK. El SHA-1 debe obtenerse de las credenciales EAS; no se conoce aquí.
  Proveer mediante entorno EAS/local ignorado, nunca commit ni chat.
- Map ID opcional y style Vima definitivo en Google Cloud. Google estándar sólo valida técnica.
- **Backend live bloqueado:** no hay servidor en este repo, URL Vima productiva ni credenciales
  Places/Routes de servidor. Faltan endpoints, autenticación/policies, sesiones server-side,
  integración de sugerencia resuelta con PassengerGateway y rutas/cotizaciones autoritativas.
  Las keys Places/Routes irán sólo al backend.
- **Nuevo Development Build requerido** por react-native-maps/configuración nativa, además
  de los cambios previos de expo-location/identidad/splash. No se ejecutó EAS Build ni se generó APK.
  No se instaló JDK/Android toolchain local ni se repitió compilación local bloqueada.
- Signoff físico antes de retirar MapLibre: mapa/atribución, cámara/fit/padding, pins/ruta/vehículo,
  ubicación/permisos, reconnect/snap/Reduced Motion, gestos/teclado y flujo completo P0.
  Revisar Tools desactivado desde la preferencia del Development Client.
- Asset de vehículo/orientación visible y reglas de grosor/opacidad por zoom siguen pendientes.
  El círculo DEV conserva su identidad; no se inventaron sprites ni umbrales de salto.
- Regla de cámara tras pan manual, composición terminal de 15 min y las demás decisiones UX
  previamente pendientes no se cerraron en esta migración.
- RN Maps no expone error de autorización Android como evento JS: sin onMapLoaded en 15 s
  se utiliza el fallo de mapa existente; diagnóstico de SDK/key requiere dispositivo.

## P0 conservado

Inicio → selección/edición → Confirma tu viaje → matching normal/prolongado/asignado dentro
del mismo PassengerRideShell y VimaRideSheet. Header PNG final de 28 dp sin texto runtime,
icono final y splash Android 160/iOS 280 sin modificaciones. Sheet radio 28/margen 20, offset guiado
por contenido, drag acotado por 24/52/88 y allowedOffsets por estado; sin toggle del título.

Origen loading/automático/manual/no disponible, selección manual protegida de ubicación tardía.
Matching normal 0–60 s, aviso 60–120 s, prolongado desde 120 s, límite 15 min; Editar/Programar esperan
cancelación autoritativa y una asignación concurrente prevalece. Sin Seguir buscando, categorías,
tabs ni pantallas nuevas. Teclado y DevMenu conservados; validación de Activity y gestos pendiente.

TanStack Query para autoridad remota, Zustand sólo UI, SecureStore separado de SQLite/KV,
Inter local, Visual/Motion v1 intactos y haptics centrales. EAS sigue vinculado a
@kingghidorahx12/vima, projectId 30422aec-d22b-40f0-8008-c6a316633fd8; developmentClient:true,
distribución interna y APK. Exportar Hermes/prebuild no equivale a compilar o ejecutar un APK.
