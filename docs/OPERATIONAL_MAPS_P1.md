# Corrección operativa de mapas P1 — 2026-10-13

Base real inspeccionada: `2c9018f4b8b34453bed2296f25cb4a8cc540f757`, checkout
`codex/product-phone-auth-p1-1`. Auth P1.1 continúa local/sin commit: sus archivos
se preservan. Esta ronda no cambia Gateway, contratos, autorización ni OTP.

## Evidencia y causas

- Clips `56303.mp4` (Passenger) y `56292.mp4` (Driver), proporcionados por el usuario:
  primer Passenger tiene el buscador en el borde superior; una reapertura recompone
  el layout. Driver reduce excesivamente el mapa al aumentar su contenido. Ambos
  muestran el overlay técnico de cuenta encima del mapa. Los clips no identifican
  el SHA/OTA instalado; no equivalen a verificar este working tree en Android.
- Passenger releía nodos sólo al cambiar `measureKey`. El primer tamaño real del
  frame no cambia necesariamente esa key: un primer `measure` sin tamaño podía
  quedarse sin relectura. El sheet además participaba en layout antes de recibir
  `interaction.height`. Ahora se oculta sin desmontarse hasta disponer de geometría,
  arranca directamente en el primer snap real y relee medidas al cambiar el frame.
- El sedán **sí aparece** en los clips durante ASSIGNED/ARRIVED_PICKUP/IN_PROGRESS.
  No se demostró un defecto permanente del PNG ni de su registro Images. El viewport
  Passenger sólo incluía la ruta de recogida: el vehículo actual podía quedar fuera
  o pegado al borde. La entrada/primera ubicación fresca de cada asignación incorpora
  su coordenada real. Revisiones GPS posteriores no reemiten encuadres ni anulan pan.
  En reapertura ASSIGNED la ruta real ya puede dibujarse sin una quote local previa;
  IN_PROGRESS no presenta la ruta de recogida como navegación del viaje.
- Driver usaba un sheet en flujo normal, sin interacción/altura por fase; el contenido
  determinaba cuánto mapa quedaba. Camera usaba padding fijo desconectado de ese
  panel. Ahora mapa y sheet permanecen montados, el panel es overlay medido y cámara
  y controles comparten el footprint visible que reporta `VimaRideSheet`.
- El selector QA visible era un control real superpuesto al mapa. Se retira del
  viewport operativo; herramientas de cuenta conservadas en `/qa/account` y DevMenu.

## Composición Driver

Proporciones sobre el frame útil **después** de safe areas, idénticas en ambos temas:

| Fase | Mapa en reposo | Panel en reposo | Panel expandido |
| --- | --- | --- | --- |
| AVAILABLE y estados compactos | 64% | 36% | 36% |
| OFFER | 53% | 47% | 47% |
| ASSIGNED | 72% | 28% | 52% |
| IN_PROGRESS | 77% | 23% | 48% |
| ARRIVED_PICKUP / PAYMENT_PENDING | 48% | 52% | 52% |

Un mínimo **medido** de acciones/error/PIN prevalece si el contenido real no cabe:
no se oculta recuperación ni se reduce tipografía. OFFER mantiene pickup, countdown
y Aceptar/Rechazar fuera de scroll; decisiones lado a lado para caber en Android
compacto. ASSIGNED/IN_PROGRESS mantienen resumen y operación principal fuera de scroll.
Dirección completa, estado de conectividad/GPS, vehículo y acciones secundarias
siguen disponibles en la región expandible/scrollable. PIN y comandos conservan
callbacks, payloads, fences e idempotencia existentes.

Driver chrome: logo 32 dp arriba izquierda; Sol/Luna 40 debajo; notificaciones
44 arriba derecha (disabled vigente); Recentrar 44, brújula 40 y Capas 44 en derecha,
gap 8, margen 16 y Capas 12 encima del panel real. Reciclados controles, press,
fade, menú de capas y preferencia global. Safe area se aplica una sola vez por el host.

OFFER encuadra vehículo/pickup y nunca dibuja ruta inexistente. ASSIGNED muestra
`assignment.value.routeToOrigin`; IN_PROGRESS centra al vehículo al entrar, sin
inventar turn-by-turn ni una ruta nueva. Pan manual bloquea refits automáticos;
recenter es explícito y usa la oclusión vigente. Bootstrap nativo conserva un
viewport local y aplica el target actual sólo al estar listo el mapa.

## Invariantes y contratos

- `assignment.sample` sigue llegando por fetch/long-poll autoritativo existente.
  Decoder conserva `capturedAt`, `headingKnown` y sequence; pruebas de propagación
  Gateway y reconexión siguen vigentes. Samples sin timestamp/vencidos no son live.
- `VehicleMarker`, Images, PNG aprobado, tamaño/anchor, AnimatedSource, heading,
  suavizado y frescura no se modifican. Ningún Layer envuelto con Reanimated.
- Home Passenger 50%, buscador 58, safe areas, medidas finales, snaps y ambos
  `usePassengerRouteFit`/`confirmationBottomPadding` conservados. Cambia el bootstrap
  de medición, no la geometría final ni la Camera compartida.
- Motion tokens, Reduced Motion, matching, lifecycle, journal offline, PIN,
  settlement, pricing, generación de rutas, backend y credenciales preservados.
- Herramientas QA release: abrir `vima-qa://qa/account?role=passenger` o
  `vima-qa://qa/account?role=driver`, sin token en la URL. Validación/edición de cuenta
  reutiliza el gate existente; DEV conserva «Cuenta de prueba Vima» en DevMenu.

## Archivos de esta ronda

- Montaje/viewport Passenger: `src/features/passenger/PassengerScreen.tsx`,
  `PassengerMap.tsx`, `assignmentMapView.ts`; bootstrap compartido opt-in en
  `src/design/components/VimaRideSheet.tsx`.
- Composición Driver: `src/dev/driver/DriverLiveScreen.tsx`,
  `src/features/driver/driverViewport.ts`, `DriverMapPanel.tsx`, `DriverOffer.tsx`,
  `DriverLifecycleControls.tsx` y `useDriverMap.tsx`.
- Reuso de chrome y targets táctiles Driver: `src/features/passenger/MapControls.tsx`,
  `MapCompass.tsx`, `src/design/components/VimaThemeToggle.tsx` (defaults Passenger
  conservados; visual Driver 40 con target real de 44).
- QA interno: `src/dev/LiveAccountGate.tsx`, `app/qa/account.tsx`.
- Regresiones: `tests/operational-maps.test.ts`, `passenger-shell.test.ts`,
  `shared-vehicle-rendering.test.ts`, `driver-presentation.test.ts`,
  `driver-map-theme.test.ts`, `passenger-active-request.test.ts`,
  `qa-android-stability.test.ts`; `scripts/check-worklets.cjs` añade exclusivamente
  la validación del nuevo worklet de snaps Driver.
- Documentación: este archivo, `docs/PROJECT_STATE.md` y `docs/QA_RELEASE.md`.

## QA Android pendiente

Con la misma versión instalada en dos teléfonos y sin USB/Metro:

1. Cerrar/abrir Passenger repetidamente en light/dark: Home correcto en primera
   apertura; Search/teclado/review/confirm conservan sus medidas y route-fits.
2. Arrastrar desde Atlacomulco de Fabela y alrededor de chrome/sheet. Sólo los
   controles visibles interceptan; expandir/contraer Driver no remonta el mapa.
3. Driver AVAILABLE → OFFER: verificar proporciones, auto real y pickup, Aceptar/
   Rechazar completos, textos largos y error recuperable sin scroll obligatorio.
4. Aceptar: ruta de recogida real visible y vehículo completo por encima del panel.
   Passenger ve el mismo sedán con ubicación fresca. Girar/pan/recentrar ambos mapas.
5. ARRIVED_PICKUP → PIN → IN_PROGRESS: operación principal visible, información y
   comandos secundarios accesibles al expandir. Sin navegación inventada ni ruta
   de recogida durante el viaje. `0 m confirmados` es válido en reposo.
6. Degradar GPS, modo avión, cerrar/reabrir, reconectar: nunca posición ficticia ni
   sample vencido presentado como live; conservar recuperación/lifecycle existente.
7. Repetir con Reduced Motion y abrir/cerrar Capas rápido; revisar controles,
   safe areas, errores y paneles en el Android compacto soportado.

La revisión de clips y los tests JS no verifican Fabric/MapLibre en dispositivo.
No commit/push, Railway, OTA ni EAS Build realizados por esta tarea. Sin cambios
nativos ni dependencias de la aplicación: nuevo Development Build no requerido.

## Validaciones del working tree

- TypeScript y lint PASS; suite completa **358/358 PASS**, incluidas seis regresiones
  nuevas. Gateway/matching/pricing **89/89 PASS**. Las pruebas de servidor usan
  proveedor simulado y temporales; la ejecución fuera del sandbox permite loopback
  y reemplazos atómicos, sin Railway ni OTP real.
- Worklets PASS (lista ampliada sólo con `driverViewport.ts`), schema MapLibre en
  pruebas Driver/Passenger, fixture isolation y splash PASS.
- Export Hermes Android/iOS y release isolation (fixture/server/pricing/paths/
  credenciales) PASS. Aislamiento se valida después de concluir el export.
- Expo Doctor **20/21**: al consultar metadata actual propone patches para nueve
  paquetes SDK 57, frente a los cinco históricos. Sin modificaciones de dependencias,
  lockfile, configuración nativa ni exclusiones para ocultar el warning.
- Comparación de hashes: todos los archivos preexistentes de auth conservan su
  contenido; sólo PROJECT_STATE recibe una sección adicional de mapas. DECISIONS,
  Gateway, sesiones, clientes y wrappers productivos P1.1 conservados. Los dos
  logs QA ajenos no se modifican ni se incluyen en la entrega.
