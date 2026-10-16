# B — seguimiento Passenger con GPS observado

Implementación local del 2026-10-15 sobre `codex/product-phone-auth-p1-1`, HEAD
`55e004ed5d2588a7fa3704f1ae345c3c11d743c3`. D0–D3 y A se conservan. A cerró
automatizadas 466/466, Gateway 90/90 y focales A+D3 20/20; su QA físico sigue
pendiente. Este trabajo no publica, concede Driver, modifica producción ni inicia
un servicio de map matching.

## Viabilidad de TomTom: documentación, cuenta y costo

Revisión oficial al 2026-10-15, sin solicitudes a Snap ni consumo de cuota:

- Snap v1 síncrono GET/POST en `https://api.tomtom.com/snapToRoads/1`.
  Entrada WGS84 `[longitude, latitude]`, 2–5000 puntos de una secuencia; admite
  headings y timestamps. Devuelve puntos proyectados y elementos de ruta.
  `snapResult` distingue `Matched`, `OffRoad`, `MaxDistanceExceeded`;
  `routeIndex` vincula el punto al elemento. `confidence` (0,1] pertenece al
  elemento vial, no es una precisión GPS ni garantía contra calles paralelas.
  [Contrato oficial síncrono](https://docs.tomtom.com/snap-to-roads-api/documentation/snap-to-roads-api/synchronous-snap-to-roads).
- Los límites generales documentados son 5 QPS, hasta 100 km por secuencia;
  planes Enterprise pueden contratar otros límites.
  [Límites oficiales](https://docs.tomtom.com/snap-to-roads-api/documentation/product-information/introduction).
- El calculador público publica 2500 solicitudes gratuitas mensuales para Snap,
  después USD 3/1000 hasta 100K, USD 2,40/1000 hasta 500K y USD 1,95/1000 hasta 1M,
  por tramos. El producto figura como TomTom Maps, mientras Vima utiliza Orbis.
  [Precios oficiales](https://docs.tomtom.com/pricing) y
  [datos del calculador consultado](https://docs.tomtom.com/_astro/PricingCalculatorV2.DjY3zrxe.js).

La clave servidor existe y no está vacía en la configuración privada local
autorizada. **No demuestra permiso Snap, plan contratado, saldo, cuota restante
ni compatibilidad de datos locales**. No se autenticó ni cambió la cuenta TomTom,
no se enviaron coordenadas y no se probó cobertura/confianza en Atlacomulco.
No asumir el antiguo cupo diario de otros planes. HTML/calculador públicos
consultados se conservaron en `.runtime/follow-b/`, fuera de Git.

Estimación propia: una solicitud por ventana, primer tramo, antes de impuestos,
conversión de moneda y cupo gratuito compartido por la cuenta:

| Ventana | Solicitudes/vehículo/hora | USD/vehículo/hora | Horas con 2500 solicitudes disponibles |
| --- | ---: | ---: | ---: |
| 2 s (casi cada muestra) | 1800 | 5,40 | 1,39 |
| 10 s | 360 | 1,08 | 6,94 |
| 15 s | 240 | 0,72 | 10,42 |
| 30 s | 120 | 0,36 | 20,83 |
| 60 s | 60 | 0,18 | 41,67 |

Para N vehículos, H horas/mes y ventana W segundos: R=N×H×3600/W.
En el primer tramo, costo incremental=3×max(0,R−cupo disponible)/1000 USD.
Ejemplo 10 vehículos×8 h×26 días con W=15: 499200 solicitudes/mes; por tramos
publicados y cupo completo serían USD 1250,58. No es una cotización de esta cuenta.

GPS directo no añade consultas/costo Snap ni demora de ventana. Snap por ventanas
añade latencia y puede revisar retrospectivamente la representación; no permite
garantizar una calle/sentido con dos puntos ruidosos en un cruce. La ausencia de
precisión GPS en los snapshots actuales y de una prueba autorizada de permisos,
presupuesto y confianza impide justificar su activación operativa ahora.

Se aplica la alternativa GPS segura expresamente autorizada para B. **No hay
adapter Snap ni flag habilitable en esta entrega**: ningún camino de ejecución
llama al proveedor. Costo y consumo Snap de B: cero.

## Causas observadas y corrección

1. Passenger usaba la política compartida que ocultaba el automóvil a los 60 s;
   no mantenía una última posición etiquetada. Ahora distingue reciente (<10 s),
   retrasada (10–60 s), caducada (≥60 s) y ausente. Usa los deadlines existentes
   watcherTimeout/TTL. Conserva el último GPS de su assignment con opacidad 0,5 y
   texto de antigüedad en el panel; jamás lo etiqueta como ubicación en vivo.
2. El renderer Passenger no recibía conexión. Ahora detiene la interpolación al
   desconectar/background, fijando la pose exactamente en el último target GPS
   aceptado, sin extrapolar, y espera una muestra nueva para retomar.
   La edad se refresca al vencer deadlines y volver a foreground; no hay polling
   de red ni render React por frame. No se afirma conocer el estado online del
   Driver sólo porque Passenger mantenga conexión: la ausencia de muestras se
   reconoce por edad.
3. La interpolación anterior aceptaba segmentos entre cualesquiera coordenadas.
   La política Passenger valida coordenadas, secuencia y timestamp crecientes
   (tolerancia de reloj futuro existente: 5 s). Un salto con velocidad aparente
   >60 m/s queda pendiente; muestra observada intacta, último GPS visual retenido
   y aviso de señal discontinua. Sólo un segundo GPS coherente en <10 s permite
   readquirir. Si el siguiente GPS vuelve al trayecto anterior, se descarta el
   outlier visual. El umbral es una barrera técnica, no velocidad comercial ni
   confianza probabilística. Sin precisión no se promete filtrar todo ruido.
4. Orientación visual por GPS válido/curso medido en 360°, incluido antimeridiano;
   desplazamientos menores a 8 m no cambian rumbo por ruido. El ancla acumula
   movimiento; no exige 8 m entre cada par de muestras. Se conserva el resolvedor
   existente, sin modificar su uso servidor. Tras lag/reconexión/discontinuidad
   se descarta rumbo previo; el siguiente desplazamiento significativo establece
   curso. En reposo el rumbo fiable caduca a 60 s; sin evidencia se usa la variante
   sin orientación, sin inventar norte vial. Giros normales conservan el worklet
   existente de shortest arc, incluidos 359↔0.

Una readquisición coloca el coche en un GPS corroborado sin dibujar la trayectoria
que supuestamente habría recorrido durante el hueco. No se puede garantizar
continuidad espacial entre observaciones distantes sin inventar posiciones. La
representación conserva el último punto mientras falta evidencia y nunca anima
un desplazamiento imposible entre ambos.

Corrección 05 QA / 03 Arquitectura (2026-10-16): antes, `paused` sólo apagaba
`active` y podía conservar una pose interpolada intermedia. Ahora copia `target`
a `pose` antes de cualquier retorno por muestra idéntica/obsoleta/inválida. Si
la política Passenger admite una muestra válida durante pausa, el target nuevo
se representa exactamente, sin interpolación. Offline/background conserva el GPS
anterior según esa política; una muestra fresca tras caducidad permite readquirir.
Driver sin la opción `paused` mantiene el comportamiento anterior. Regresiones
integradas del hook/política y resultados actuales en PROJECT_STATE; la tabla de
validaciones inferior corresponde al cierre original B del 2026-10-15.

## Autoridad, límites y configuración real

- `observed` conserva coordenada/heading/sequence/timestamp recibidos;
  `visual.fix` es un GPS seleccionado, nunca una proyección vial. Durante el breve
  suavizado entre dos GPS coherentes, la pose intermedia es sólo presentación.
  No se modifica el objeto de entrada, cache Query, snapshot ni persistencia.
- No se proyecta al camino cercano, no se lee la ruta planeada para mover el
  coche y no se detecta una calle verificada. Paralelas/cruces/rural conservan GPS.
- Snapshots no incluyen precisión, velocidad sensorial, momento específico del
  heading ni estado de conexión del Driver. Antes de PIN algunos timestamps son
  recepción del Gateway, no necesariamente captura del sensor. B no cambia esos
  contratos ni afirma una precisión/latencia que no conoce.
- Memoria local por assignment; cambio de assignment, fase no pertinente o
  ausencia histórica de timestamp la descarta. Reabrir restaura únicamente un GPS
  real con su antigüedad. Nunca aparece flota en Home ni posición predeterminada.
- Sólo ASSIGNED/ARRIVED_PICKUP/IN_PROGRESS muestran vehículo. Cámara, pan manual,
  route-fit, rutas, A, lifecycle/PIN/efectivo, tarifas y autorización D1/D2 intactos.
- Única frontera MapLibre animada: GeoJSONSource. Layers normales, sprite aprobado,
  `icon-rotation-alignment: map`, sin sumar bearing de cámara. El halo one-shot
  separado permanece tenue. Reduced Motion Passenger coloca muestras sin tween;
  no se añade loop. Driver conserva su opción essential y TTL previo.
- Política visual local en `passengerVehicleTracking.ts`; no variables servidor,
  secretos públicos, dependencias o configuración nativa nuevos. El hook compartido
  sólo recibe opciones opt-in Passenger para pausa y descarte de rumbo obsoleto;
  sus valores predeterminados Driver no cambian.

Una integración Snap futura debe volver a 03: confirmar plan/permiso/presupuesto
con autorización de consumo, precisión disponible, compatibilidad cartográfica y
trazas locales. Requerirá adapter Gateway default-off, ventanas por conductor,
presupuesto global/durable de una réplica, cooldown, timeout/fallback sin bloquear
el stream GPS y validación conjunta de matched/confidence/discrepancia/continuidad/
dirección/ambigüedad. Ningún umbral de confianza vial se inventó en esta ronda.
No debe persistir ajustes como telemetría ni alimentar ETA/lifecycle/tarifas.

## Validaciones y evidencia

Resultado final y evidencia local ignorada en `.runtime/follow-b/`:

| Validación | Resultado |
| --- | --- |
| Suite completa, concurrencia limitada a 3 procesos | **477/477 PASS** |
| Gateway existente | **90/90 PASS** |
| Focales seguimiento/renderer/motion/bearing (11 nuevos B) | **20/20 PASS** |
| TypeScript, lint, worklets, splash, diff-check | PASS |
| Schema MapLibre normal Layers y fuente sin location | PASS |
| Exportes Hermes Android/iOS con caché Metro limpia | PASS |
| Release/QA/fixtures/paths, HTTPS productivo y clave servidor excluida | PASS ambas plataformas |
| Preservación D0 (18 renglones), D1–D3/A fuera del alcance B y logs QA | PASS |
| GPS/Android físico, Snap/permiso/consumo real | PENDIENTE / sin llamadas Snap |

Exportes locales en `.runtime/follow-b-release/`, sin subirlos. SHA256 Android
`be0cd0684cf7531bfdea2aea4c2e8255c2e37060bcc56247ba763996f5d46839`;
iOS `1c8a3d8d4cfc2d29dd3276fd2eec4849946353ac80a00bed0400cc1f784f7691`.
HTTPS efectivo comprobado en ambos: `https://vima-gateway-product-production.up.railway.app`.
Sin cambios nativos/dependencias ni Development Build nuevo. B no requiere Gateway
adicional; D1/D2/A locales conservan su orden de publicación documentado previamente.

La regresión nueva cubre rectas, diagonales/giros, reposo,
ruido, caducidad de rumbo, secuencias/timestamps inválidos, salto/corroboración,
paralelas/rural/túnel sin proyección, offline/reconexión, deadlines/background,
cambio de assignment/reapertura y aislamiento de datos comerciales. Harness real
del hook Reanimated comprueba pausa y ausencia de renders por frame. Schema
MapLibre, ambos temas y RM conservan el sedán/Source normal; regresiones Driver
anteriores siguen ejecutándose. Los dobles nativos no verifican Fabric físico.

Archivos B: `passengerVehicleTracking.ts`, `usePassengerVehicleTracking.ts`,
`DriverVehicleMarker.tsx`, `useVehicleMotion.ts`, `PassengerMap.tsx`,
`PassengerScreen.tsx`, `PassengerJourneySummary.tsx`, regresión nueva
`passenger-vehicle-tracking.test.ts` y expectativa de frescura Passenger en
`shared-vehicle-rendering.test.ts`; PROJECT_STATE, DECISIONS y este informe.

## QA físico PENDIENTE

Tras una futura publicación coordinada autorizada de D1/D2/A y cliente B:

1. Dos Android con las identidades/capacidades autorizadas. Light/Dark/RM;
   ASSIGNED → ARRIVED_PICKUP → IN_PROGRESS conserva sedán real, ruta, PIN y efectivo.
2. Rectas, diagonales, giros y mapa rotado: curso real sin oscilación en reposo;
   no confundir orientación del mapa con sentido de circulación. Pan/recenter intactos.
3. GPS ruidoso/estacionamiento, calles paralelas/cruces y camino sin cartografía:
   no inventar vía ni seguir automáticamente ruta planeada. Observar límites GPS.
4. Modo avión/cierre en Driver y en Passenger: sin muestras nuevas se detiene,
   aparece antigüedad, sedán atenuado conserva último punto. Reconectar/reabrir:
   sin segmentos ficticios, respuestas viejas ni rumbo heredado de otra asignación.
5. Túnel/pérdida >60 s, readquisición distante: aviso; si el salto es incoherente,
   exige corroboración antes de cambiar visual. No animación cruzando manzanas.
   No cambia distancia cobrable.
6. Android compacto: texto de frescura, panel expandible y acciones accesibles.
   Sin errores MapLibre/Fabric/UI Runtime. Ausencia de location nunca inventa coche.

Sin pruebas de GPS/Android ni Snap reales en esta entrega. iOS físico PAUSADO.
