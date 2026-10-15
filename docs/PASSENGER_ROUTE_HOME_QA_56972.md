# Passenger P1 — encuadre y Home, QA 56972

Base inspeccionada: `codex/product-phone-auth-p1-1` @
`e8896a4d9cfb9cda0cf3642556424f0776119604`. Sin cambios tracked al empezar;
los dos logs QA ajenos siguen intactos y sin seguimiento. Tras la implementación
local se autoriza commit/push y OTA Android exclusivamente en
`product-access-preview`, environment `production`, runtime `0.0.2`.
Sin APK nuevo, Railway ni cambios en otros canales.

Video revisado: `C:/Users/nexar/Downloads/56972.mp4`. En torno a 32–40 s la
confirmación/transición muestra el destino junto al panel; en 40–48 s y 56–64 s
MATCHING sitúa pines/tramos en los bordes y repite el título arriba y en el panel.
La fila unida de guardados y el Cancelar en caption también son visibles.
La revisión del video anterior no verifica físicamente estas correcciones.

## Causas de encuadre

- usePassengerRouteFit sólo tenía intenciones reviewing y confirm; al entrar en
  requesting/MATCHING desaparecía la intención protegida. PassengerScreen volvía
  a cameraMode=automatic y Camera aplicaba el target genérico, con padding de
  chrome/sheet, sin las holguras del artwork de los pines del fit dedicado.
- El token de confirmación se consumía una sola vez por solicitud. Una nueva
  altura estable del panel no podía renovar el fit. La deduplicación nativa por
  sequence tampoco permitía corregir el padding conservando la misma intención.
- Recentrar emitía un centro de ubicación, no un encuadre de la ruta completa.
  El fit explícito anterior podía ejecutarse incluso después de un pan manual.

## Corrección acotada

1. Reviewing conserva su padding inicial; CONFIRM, requesting y cada fase de
   matching disponen de una intención por ruta/fase/geometría estable. Se usan
   los nodos header/content/viewport ya medidos y sus generaciones vigentes.
   El chrome superior se mide sin alterar su layout; en matching se retira su
   título duplicado y no se reserva espacio para ese título ausente.
2. CONFIRM/requesting/MATCHING mantienen desactivado el target automático genérico.
   Camera compartida y su política Reduced Motion no cambian. Sólo el fit validado
   puede mover la cámara en esas fases.
3. Cada intención incluye todos los vértices LineString/MultiLineString y ambos
   extremos, tras validar la correspondencia de la cotización con el borrador.
   Se añaden **28 dp de espacio exterior** a las holguras existentes del pin,
   encima del chrome y del borde físico del panel. Confirm conserva sus +28 dp
   inferiores ópticos; matching no los hereda. No cambia la geometría de la ruta.
   A la derecha se respeta también la columna existente de controles (margen y
   ancho de tokens), para no situar el pin detrás de Capas/brújula. Reviewing
   conserva su padding horizontal previo.
4. La firma usa fase, identidad de ruta, altura estable del sheet, tamaño del
   viewport y oclusión superior, redondeados a dp. Un rerender, una muestra GPS
   o la animación del sheet no constituyen una intención nueva. Un cambio de
   altura real, rotación o banner asentado puede producir un fit adicional.
5. Pan manual suspende los fits, incluso si llega otra medición/fase. En CONFIRM/
   MATCHING el control existente pasa a «Recentrar ruta» tras pan: emite una nueva
   intención con la última geometría estable, sin afirmar que el GPS quedó centrado.
   El control se retira del área útil al recuperar el fit; no se reserva espacio
   para un CTA invisible ni se crea un bucle fit/proyección/visibilidad del CTA.
   Home y Search mantienen su política de ubicación/centrado existente.
6. Si un viewport transitorio es menor que el padding requerido, no se envía un
   bounds/padding imposible a MapLibre ni se reducen las holguras. La siguiente
   geometría útil genera una intención nueva sin remount. Una superficie tan
   ocluida que no deje espacio real requiere revisión física; no se cambia su snap.

## Pulido visual

- Casa/Trabajo/Favoritos: tres botones flex independientes de 44 dp, gap 8 dp,
  radio 16 dp, tintes semánticos ya existentes por botón y level1 individual.
  El background se recorta en el propio botón; el wrapper conserva su sombra.
  Mismos iconos/labels/handlers/persistencia y geometría Light/Dark. No hay un
  contenedor coloreado común ni divisores. Sin ancho fijo cercano al viewport.
- Matching conserva un solo título principal en el panel y toda su información.
  Cancelar reutiliza VimaButton secundario/destructivo, ahora bodyMedium (16 dp),
  sin compact/caption. Comando, disabled, haptics y Motion permanecen.
- Scroll Home, pointerEvents, nestedScrollEnabled, arbitraje headerPanEnabled,
  panel Home 50%, buscador 58 dp, safe areas y bottom nav no se modifican.

## Regresiones y validación

Pruebas nuevas con hooks/React y el adaptador nativo simulado de MapLibre:

- CONFIRM → requesting → MATCHING sólo después de medir su generación actual;
  cambio de altura/oclusión/tamaño y dedupe de medidas equivalentes.
- Pan antes/después del fit, geometría que cambia mientras se explora,
  Recentrar con la última medición, ausencia de refits por GPS/rerenders y
  respuesta tardía bajo Search lock o destino incompatible.
- Bounds contienen todos los puntos, padding fuera del artwork, padding imposible
  omitido y recuperación sin remount; animación 420 ms o 0 con Reduced Motion.
- Light/Dark: botones independientes, un solo título, Cancelar 16 dp y cancelación
  autoritativa; los checks existentes del scroll y bottom nav se mantienen.

Resultados: suite completa **419/419 PASS**, focales **7/7 PASS** y comprobación
nativa final **2/2 PASS**. TypeScript, lint, worklets, splash, fixture isolation
y diff-check PASS. Validaciones repetidas para publicación: **419/419 PASS**,
TypeScript, lint, worklets, splash, fixture isolation y diff-check PASS.
Exportación limpia EAS production: Hermes Android/iOS, aislamiento release de
servidor/tarifas/paths y separación QA/producto PASS. La constante exacta del
cliente productAuthClient en ambos bytecodes es
`https://vima-gateway-product-production.up.railway.app`; sin destinos `.invalid`.
SHA-256 Android (base64url): `zuSt7yHxWzhSKWqN29fV2psmR0Bq0FlCaHOorxEfA2U`.
La OTA Android usa ese export comprobado sin recompilar durante la publicación.
No se usa una prueba React
para declarar que Android reconoció un gesto real ni que renderizó el padding.

Archivos de implementación: `src/features/passenger/PassengerScreen.tsx`,
`PassengerMap.tsx`, `usePassengerRouteFit.ts` y `MapControls.tsx`. Pruebas:
`tests/passenger-route-viewport.test.ts` y `tests/passenger-shell.test.ts`.
Documentación: este informe, `docs/PROJECT_STATE.md` y `docs/DECISIONS.md`.

## Android físico pendiente

1. Android ~20:9, Light/Dark: seleccionar Plaza/otro destino, CONFIRM, solicitar;
   ruta y ambos pines completos y separados del panel/chrome/bordes en MATCHING.
2. Pasar a expansión/prolongado, offline/error/reconexión; al asentarse un cambio
   real de panel se encuadra una vez, sin oscilación ni recentrados periódicos.
3. Pan/zoom/rotar manualmente: no interrumpir la exploración. Recentrar ruta debe
   recuperar la línea completa con la última altura; después no repetir el fit.
4. Cancelar → mismo/otro destino → cotizar; verificar autoridad de ruta/distancia/
   tarifa y ausencia de geometría antigua. Pins/heading/sedán siguen vigentes.
5. Botones Casa/Trabajo/Favoritos con fondos contenidos y sin overflow en Android
   compacto, tipografía ampliada y ambos temas. Probar configurar/seleccionar/
   gestionar con las acciones existentes.
6. Home: confirmar de nuevo que scroll/gestos y bottom nav permanecen como en la
   versión físicamente aprobada. Matching: un título y Cancelar legible/operable.

Sin backend, cambios de contratos, auth, matching/lifecycle, tarifas/routing fast,
Driver, assets, dependencias ni configuración nativa. La publicación autorizada
usará el mismo bundle Android comprobado tras exportar con caché limpia y EAS
production; se verificará su identidad frente al bundle servido. QA físico PENDIENTE.
