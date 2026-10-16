# A — Selección de origen y recogida Passenger

Implementación local sobre `codex/product-phone-auth-p1-1` @
`55e004ed5d2588a7fa3704f1ae345c3c11d743c3`, con D0/D1/D2/D3 conservados.
No inicia B. Sin commit, push, cuentas Driver reales, Railway, OTA ni APK.

## Dirección aprobada aplicada

La instrucción 04→03→01 de esta ronda y sus tres tableros adjuntos son la referencia.
Cuando el texto de una ilustración dice arrastrar/tocar el pin, prevalece la regla
explícita aprobada: **pin fijo, mapa móvil, coordenada sólo al asentarse la cámara**.
No se copiaron layouts iPhone ni assets maestros del tablero.

- Home ofrece «Punto de recogida»; el campo Origen vigente sigue siendo editable.
  Buscar, Casa/Trabajo/Favoritos/Recientes y GPS reutilizan los flujos existentes.
  Elegir un origen nuevo no tiene la restricción de 200 m respecto al GPS ni al
  origen anterior. GPS tardío no sustituye una elección explícita.
- «Seleccionar origen en el mapa» inicia una elección libre. Después, «Ajustar
  recogida» usa el origen elegido como referencia y conserva esa referencia al
  ajustar de nuevo; no se permite encadenar pequeños ajustes para desplazarla.
- El mapa y sheet se mantienen montados. El ajuste usa un subestado de la búsqueda,
  el mismo VimaRideSheet, tokens, campos, botones y límites de snaps existentes.
  La altura local se adapta al contenido hasta el snap intermedio; no se alteran
  Home 50%, scroll, bottom nav ni geometría de otras fases.
- El pin aprobado comparte artwork con MapPlacePin, en verde o rojo según validez.
  Su posición es el centro de la parte visible del mapa, descontando chrome/panel.
  `unproject` usa el ancho **nativo medido** para respetar también los márgenes del
  viewport. No se toma la coordenada del tap ni de `onRegionIsChanging`.
- `onRegionWillChange` invalida lectura/dirección pendientes. `onRegionDidChange`
  captura el punto; generaciones y AbortController impiden que una proyección o
  geocodificación anterior reemplace el punto actual o un ajuste cancelado.
  Si cambia la geometría visible estando la cámara quieta, se vuelve a leer la
  coordenada bajo el mismo pin; durante movimiento se espera a DidChange.
- Carga, cámara en movimiento, fallo de lectura con reintento, dirección no
  disponible, referencia manual, offline y fuera de zona tienen estados explícitos.
  Confirmar permanece deshabilitado sin punto asentado/online/dirección o referencia.
- No se añade una pantalla de éxito ni otra confirmación de recogida. Confirmar
  aplica el punto una vez y vuelve al flujo vigente de revisión/tarifa del viaje.
  Si coincide con la referencia no se crea un segundo origen ni campo redundante.
- Light/Dark usan la misma estructura, temas globales y tipografía del sistema.
  No se introduce animación continua; Reduced Motion sigue la política existente.

## Contrato compatible y autoridad

```ts
interface RideDraft {
  origin: Place;             // recogida efectiva: routing, tarifa, matching y llegada
  referenceOrigin?: Place;   // únicamente si su coordenada difiere de origin
  destination: Place;
  stops: readonly Place[];
}
```

Se añade el mismo campo opcional a QuoteDraft/RoutePreview/AuthoritativeRideQuote.
El cliente transmite sólo los campos permitidos de Place. El servidor los valida
otra vez; no acepta distancias, precios, rutas ni estados de cobertura calculados
por el cliente. Coordenadas inválidas y propiedades ajenas fallan cerrado.
La cotización, el snapshot Passenger y su restauración conservan la referencia.
Quotes/requests/snapshots anteriores sin el campo siguen siendo válidos, sin
migración de archivos ni cambio de schema de autenticación D1.

El radio por defecto es **200 m**, geodésico Haversine con radio terrestre 6 371 000 m.
El límite incluye exactamente 200 m, sin redondear metros; sólo se tolera error
aritmético inferior a una micra. 201 m se rechaza. Se configura en Gateway mediante
`VIMA_PICKUP_ADJUSTMENT_MAX_METERS` positivo/finito. La sesión HTTP ya existente
`GET /v1/matching/session` anuncia opcionalmente `pickupAdjustmentMaxMeters`; el
decoder valida el valor y el gateway móvil lo usa para círculo, texto y validación.
Sin ese metadato se conserva el default 200. No se crea otro endpoint ni autoridad.
Cambiar esa política requiere renovar la sesión/bootstrap del cliente; el servidor
siempre vuelve a validar la política vigente al cotizar.

La elección inicial libre omite referenceOrigin. Cuando sí se envía, el Gateway
valida ambas coordenadas y su distancia antes de llamar al proveedor. Referencia
coincidente se canoniza omitiendo el campo. Errores diferenciados:

- `pickup_outside_area` (400): ajuste fuera del límite.
- `route_unavailable`: el proveedor no puede entregar la ruta; no hay sustituto.
- Región sin tarifa/cobertura comercial: preview sin precio, nunca solicitud válida.
  La referencia también debe pertenecer a cobertura de pricing; no cambia el perfil,
  métrica, tarifa ni ruta calculados desde la **recogida efectiva**.

Corrección 05 QA / 03 Arquitectura (2026-10-16): `VIMA_GEO_SERVICE_AREA_BOUNDS`
delimita exclusivamente aportaciones de lugares; no limita cotizaciones, paradas,
destinos intermunicipales ni referencias. Se retiró ese filtro indebido de pricing.
La cobertura comercial sigue siendo la de `selectPricing`, con ruta real y precio
autoritativo. Una referencia fuera de ella sólo permite preview sin precio, nunca
una cotización comercial válida. Los bounds de aportaciones siguen aplicándose en
su endpoint original. El límite geodésico de ajuste (200 m) y llegada (150 m) no cambian.

El círculo es una zona geodésica de ayuda visual, no una frontera autoritativa ni
geometría vial. No se dibujan accesos ni rutas inventadas. Las capas normales de
zona están debajo de Traffic/ruta/pines; no se añade Animated Layer.

### Referencia manual y calles sin cartografía

Reverse geocoding es descripción, no selección de coordenada ni prueba de acceso.
Aunque devuelva una ubicación cercana, se conserva exactamente el punto del pin.
Si no hay dirección, se exige una referencia manual para confirmar. Se informa
que no acredita acceso vehicular. La referencia se persiste con los campos Place
existentes: sin dirección, `name = Referencia manual`, `address = referencia`; con
dirección, se conserva `address` y `name = Referencia: <texto>`. Texto máximo 240.
No se inventa un contrato de calles verificadas ni se publica un lugar al catálogo.
Sólo puede solicitarse después de obtener una ruta/precio autoritativos válidos.

### Cotización y concurrencia

El punto pendiente vive separado del borrador confirmado. Mover/cancelar no cambia
su cotización. Durante selección no se permite solicitar, incluso invocando submit
directamente. Confirmar cambia origen/referencia atómicamente en el estado React,
genera una revisión/operationId de cotización nueva y descarta la línea/precio anterior
del borrador visible hasta recibir la cotización nueva. Reintentos del mismo borrador
conservan su operationId; cambiar punto/destino crea otro. Respuestas tardías quedan
en su queryKey anterior y no habilitan solicitar con una cotización obsoleta.

Cancelar/editar/reseleccionar y restaurar un viaje conservan la referencia confirmada.
Un origen nuevo elegido por búsqueda/GPS/mapa libre la reemplaza y reinicia el ajuste;
cambiar sólo destino conserva la referencia. Expiración, fences de identidad D1/D2,
recuperación de request ambiguo y reconciliación autoritativa siguen vigentes.

Matching persiste la cotización íntegra. Oferta y assignment Driver, cálculo real
de routeToOrigin y comando de llegada continúan usando `quote.origin`. El radio de
llegada **150 m** no cambia ni comparte configuración con el ajuste de 200 m.
No se modifican lifecycle, PIN, efectivo, tarifas ni `routeType=fast`.

## Validación

Las nuevas regresiones cubren:

- 0/199/200/201 m, coordenadas inválidas, política configurable, origen inicial libre.
- Cobertura de referencia y recogida, falta de ruta, replay/conflicto/concurrencia
  de cotización y contrato antiguo sin referencia.
- HTTP con OTP/Driver simulados: mismo pickup en Passenger/oferta/assignment,
  mismo destino del cálculo routeToOrigin; Driver a 199 m aún no puede llegar,
  traslado a pickup permite llegar; reinicio conserva referencia y estado.
- Payload manipulado rechazado por Gateway, independientemente de la UI.
- Pin fijo: taps y eventos intermedios no seleccionan; captura nativa asentada,
  fallo y reintento, ancho nativo de 352 dentro de shell 360, ambos temas/RM.
- GPS tardío, Reverse tardío, cancelación, referencia manual sin calle y conservación
  de dirección conocida. Cambio de destino/origen, nueva quote y bloqueo de submit.
- Círculo geodésico y capas MapLibre validadas contra style-spec; no Animated Layer.

Resultados finales:

| Validación | Resultado |
| --- | --- |
| Suite completa | 466/466 PASS, sin skips ni fallos |
| Gateway/matching/lifecycle/pricing | 90/90 PASS |
| Focales A y recorrido productivo D3 | 20/20 PASS (12 A + 8 D3) |
| TypeScript y lint | PASS, sin errores/warnings ESLint |
| Worklets, splash, diff-check | PASS |
| Style-spec MapLibre para zona | PASS, incluido en suite |
| Export Hermes Android/iOS final con caché limpia | PASS |
| Release/QA/fixtures/paths y HTTPS productivo en bytecode | PASS ambas plataformas |
| Cierre D0, archivos protegidos D1/D2/D3 y dos logs QA | Preservados; staging vacío |

Evidencia local ignorada en `.runtime/pickup-a/`; exportes finales en
`.runtime/pickup-a-release-close/`, sin publicación. SHA-256 de bytecode:

- Android: `6334fa95a779e2b5863d5cf57aab07442fb7eb43d5c00212fb3f10bf2f7a8c91`.
- iOS: `96888927a582548da93fe4ab1619130e4a86e33dcf0c2d007a8cdc87dca28731`.

La suite completa fue seguida por focales A/D3 y checks estáticos finales tras
el guard de inicio del selector: una selección nueva espera su primer DidChange,
sin adoptar una lectura de la cámara quieta de la selección anterior.

## Archivos del alcance A

- UI/flujo: `PassengerScreen.tsx`, `PassengerMap.tsx`, `usePassengerFlow.ts`,
  `PickupSelectionPanel.tsx`, `model.ts`, `passengerErrors.ts`.
- Mapa: `MapPlacePin.tsx` (artwork fijo), `PickupAreaLayer.tsx`; Camera y route-fit intactos.
- Contratos/adapters: `geospatial/pickup.ts`, `contracts.ts`, `client.ts`,
  `passengerGateway.ts`, `pricing/contracts.ts`, `normalize.ts`, `matching/contracts.ts`,
  `decode.ts`; bootstrap Passenger producto/QA sólo propaga el límite servidor.
- Gateway: `config.ts`, `pricing/service.ts`; matching HTTP anuncia el límite,
  coordinator únicamente propaga referenceOrigin en snapshot. Router mapea errores.
- Tests: `passenger-pickup.test.ts`, `passenger-pickup-gateway.test.ts`, harness
  Passenger (unproject/frontera nativa) y fixture productivo D3 (draft/ruta parametrizados).
- Este informe, PROJECT_STATE, DECISIONS y enlace de configuración en gateway/README.

## Entrega y QA físico pendientes

Esta ronda necesita Gateway actualizado **antes** de una futura OTA del selector:
el servidor anterior rechaza referenceOrigin. No desplegar una OTA aislada. El
metadato opcional de sesión es compatible con clientes anteriores. Se conservan
las condiciones de D3 respecto a rating null/aprobación real y publicación.
Sin dependencias/cambios nativos, no requiere Development Build por este alcance.

Checklist físico Android compacto, Light/Dark y Reduced Motion, con futura entrega
autorizada y versiones confirmadas:

1. Abrir en frío; elegir origen lejano al GPS mediante búsqueda, GPS y mapa. GPS
   tardío no desplaza elección ni mapa durante ajuste. Home y scroll conservados.
2. Mover mapa en horizontal/vertical/diagonal, rotarlo y hacer zoom: pin inmóvil,
   dirección sólo al detenerse; ningún tap elige un punto alternativo.
3. Ajustar alrededor de 199/200/201 m: círculo/mensaje/CTA coherentes con servidor;
   cambiar referencia requiere elegir origen nuevo, no encadenar desplazamientos.
4. Abrir teclado, introducir referencia, cerrar teclado, probar textos largos y
   back/cancelar; el pin sigue representando el centro visible. CTA accesible con
   scroll del panel cuando el contenido o teclado reduzcan espacio.
5. Sin dirección/cartografía: referencia manual honesta; sin ruta real no puede
   solicitar. Probar error, timeout, offline/reconexión y reintento sin perder borrador.
6. Confirmar → cotizar → cambiar destino/recogida → cancelar/repetir: línea, pins,
   distancia y precio corresponden al punto confirmado, nunca a uno pendiente.
7. Reabrir solicitud activa en dos teléfonos autorizados: mismo pickup para
   Passenger/Driver, ruta real al pickup y llegada de 150 m, PIN/efectivo sin regresión.

Todo este checklist físico queda **PENDIENTE**; las pruebas usan proveedores y
coordenadas simulados, no prueban acceso vehicular real ni SMS/GPS nuevos.
