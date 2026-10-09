# Lifecycle y settlement P0

Implementado sobre `MatchingCoordinator` y su `RequestRecord`. No hay otro store
de viajes ni una máquina autoritativa en móvil. Sigue siendo un único proceso
gateway con commit serializado, persistencia atómica antes de receipts y
notificaciones, revisions e invalidación por long-poll.

## Estados y reglas

`SEARCHING → ASSIGNED → ARRIVED_PICKUP → IN_PROGRESS → PAYMENT_PENDING → COMPLETED`.
El índice Passenger sigue ocupado hasta COMPLETED, CANCELLED o NO_DRIVER_FOUND.
Driver permanece ASSIGNED hasta cerrar/cancelar. Su liberación conserva la regla
existente: PAUSED por expiraciones, AVAILABLE con location fresca o LOCATING.

- `arrive`: ASSIGNED, assignment vigente, última location autoritativa fresca y
  distancia geodésica al origen ≤ `MatchingOptions.pickupRadiusMeters` (150 m
  por defecto). `arrivedAt` queda persistido.
- `start`: ARRIVED_PICKUP y PIN correcto. En un commit guarda `startedAt`,
  inicializa meter y entra en IN_PROGRESS. Un PIN incorrecto no incrementa la
  revision del viaje. El PIN sólo se devuelve al Passenger; Driver nunca lo recibe.
- `no_show`: ARRIVED_PICKUP y al menos 300000 ms desde arrivedAt. CANCELLED sin
  cargo. El reinicio conserva el timestamp; no reinicia la espera.
- Passenger puede cancelar SEARCHING y, con assignmentId, ASSIGNED/ARRIVED_PICKUP.
  Driver puede cancelar los dos estados pre-PIN con assignmentId: rematch de la
  misma request, exclusión y deadline originales. Después de PIN no hay cancelación.
- `complete_stop`: IN_PROGRESS, índice cero-based exactamente igual al siguiente
  stop pendiente de `quote.stops`. No crea fases ni geofences.
- `incur_addition`: IN_PROGRESS, código efectivo del profile/override congelado,
  una sola vez. Retry con el mismo commandId conserva el receipt.
- `finish`: IN_PROGRESS, sequence final confirmada e igual a la última del meter.
  Normal exige todos los stops. Crea settlement inmutable y PAYMENT_PENDING en
  el mismo commit. Normal/early concurrentes: primero en commit gana.
- `cash_received` o `cash_problem`: PAYMENT_PENDING → COMPLETED. El segundo
  genera disputeId server-side durable. Primer commit gana; retry conserva ID.

## HTTP

Se conservan auth, endpoints existentes y long-poll. Recurso Driver:

`POST /v1/driver/assignments/:requestId/commands`

Body: `{ assignmentId, commandId, command }`. Formas de command:

```json
{ "name": "arrive" }
{ "name": "start", "pin": "1234" }
{ "name": "no_show" }
{ "name": "complete_stop", "stopIndex": 0 }
{ "name": "incur_addition", "code": "codigo-configurado" }
{ "name": "finish", "kind": "normal", "finalTelemetrySequence": 2 }
{ "name": "finish", "kind": "early", "finalTelemetrySequence": 2 }
{ "name": "cash_received" }
{ "name": "cash_problem" }
```

PIN ilustrativo, no secreto operativo. No se registran payloads, PIN, posiciones
ni configuración comercial en logs/trazas. Los errores conservan códigos sanitizados.

`POST /v1/driver/assignments/:requestId/telemetry` recibe
`{ assignmentId, sample: { sequence, coordinate, capturedAt } }`.
Sequence comienza en 1; capturedAt es timestamp entero en ms, monotónico, no
anterior a startedAt ni posterior al reloj server. Duplicate idéntico no muta;
payload distinto en la misma sequence, gaps y assignment obsoleto se rechazan.

Cancel Driver existente requiere ahora `{ actionId, assignmentId }`.
Cancel Passenger conserva `TripCommand` con `payload.reason` y, si hay
assignment, `payload.assignmentId`. Clientes antiguos deben reconciliar y enviar
esta identidad; nunca se infiere el target actual para ejecutar una acción stale.

Driver GET/receipts añaden estado, lifecycle, stops y códigos de additions al
assignment sin PIN. Tras terminal, `lastTrip` conserva el resultado de pago sin
una asignación activa. Passenger mantiene la composición assigned durante las
fases activas y presenta estado de viaje/pago autoritativo; COMPLETED permite volver
al Inicio. No se añaden navegación externa, otros pagos, comunicación ni ratings.

## Snapshot v4 y precios

El archivo existente `matching-v1.json` contiene ahora `version: 4` y un catálogo
`pricingBases`. Cada request referencia `pricingBasisId`: SHA-256 determinista
del contenido validado completo, con claves ordenadas. La quote service congela
la config usada; no se copia una config por request. Se guarda configVersion como
provenance junto a profile/overrideId. Versiones comerciales iguales con contenido
distinto producen bases distintas.

Migraciones v1→v2→v3 se conservan. v3→v4 sólo reconstruye bases activas si existe
config actual, coincide su version, existen profile/override exactos y repricing
de las métricas originales reproduce todo `quote.price`. Si no se puede probar,
recuperación falla cerrada con `invalid_matching_snapshot`. No borrar snapshots
para resolverlo: recuperar la config histórica equivalente. Histórico terminal
sin basis y receipts antiguos se conservan sin bloquear por falta de config.

TripMeter vive en Request.lifecycle; guarda telemetría ordenada y métricas.
La primera muestra establece el punto inicial. Distancia es la suma geodésica de
segmentos consecutivos, redondeada una vez al entero más cercano; duración es
floor((último capturedAt − startedAt)/1000). Sin speed caps, smoothing, routing
o llamadas TomTom. Pricing recibe enteros seguros. No se acepta nueva telemetría
en PAYMENT_PENDING. Las muestras recibidas actualizan también la location Driver
con su capturedAt; un replay antiguo no se convierte en una location fresca.

Settlement congela tipo, assignment, fecha, sequence final, meter, incurred codes,
PriceBreakdown y provenance:

- **Normal = quote.price exacto**, sin repricing; meter es evidencia.
- **Early = priceTrip existente**, misma config congelada, profile/override de la
  quote y meter real. Se filtran sólo additions efectivamente incurridas. Aplica
  el minimum normal. **Sin cap contra quote y sin penalización**: puede ser mayor.

## Journal offline Driver

SQLite KV existente, clave `vima.driver-journal.v1.<accountId>`, payload versionado
y scoped por requestId + assignmentId. No nuevas dependencias. Guarda sólo
telemetría y comandos post-PIN, en orden, con IDs estables. Cada entrada se
persiste antes de indicarse como pendiente. No hay éxito local autoritativo.

El watcher foreground existente aporta capturedAt real. Post-PIN encola muestras;
pre-PIN conserva POST location y requiere respuesta online para acciones.
Las paradas offline se muestran como intenciones pendientes, separadas de las
confirmadas; pueden encolarse en orden antes de finish. Cash requiere confirmación
server de PAYMENT_PENDING. GPS en background no se añade en esta ronda.

Reconexión/reinicio: GET primero, validar account/request/assignment, replay
ordenado, confirmar telemetría antes de finish y persistir cada ack. GET fallido
conserva el journal; GET que demuestra terminal/replacement permite descartarlo.
Receipt perdido reusa la misma sequence/commandId. Referencia al último receipt
monótono evita que un render atrasado reutilice secuencias o revierta el estado.
Registro local corrupto falla explícitamente y no se borra automáticamente.

## QA físico pendiente

Ambos themes, dos cuentas/dispositivos: llegada cercana/lejana/GPS viejo, PIN
correcto/incorrecto, cancelaciones pre-PIN y no-show tras reinicio; paradas
ordenadas, telemetry, normal/early con extras, mínimo/no-cap, pago y disputa.
Modo avión post-PIN, encolado, reinicio de app y reconexión sin duplicar comandos;
respuesta perdida en finish/cash y journal frente a replacement. Verificar CTAs,
teclado PIN, safe area y lectura de estados. No se declara Android físico verificado.
