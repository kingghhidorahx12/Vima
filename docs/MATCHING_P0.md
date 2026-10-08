# Request / matching / Driver P0

Implementado en `codex/request-matching-driver-p0`, desde `f007a532`.
Alcance: crear request, buscar, ofertar, asignar y cancelar/reasignar. No hay
llegada, inicio, finalización, cobro, tracking posterior, push ni multi-instance.

## Autoridad y API

Los endpoints matching/request/Driver requieren Bearer; quotes conserva su
acceso anónimo previo, que no habilita solicitudes. El principal sale de la
configuración del servidor, nunca de un ID de cuenta/Driver enviado en el body.
Passenger sólo puede leer/mutar sus requests; Driver sólo su estado/ofertas/
assignment. El gate técnico está exclusivamente en rutas DEV.

| Método / endpoint | Entrada | Respuesta |
|---|---|---|
| GET `/v1/matching/session` | — | accountId, role, matchingAvailable |
| POST `/v1/passenger/quotes` | Contrato de quote vigente | Mismo pricing público; owner interno si autenticado |
| POST `/v1/passenger/requests` | quoteId, requestId | PassengerTrip + requestState |
| GET `/v1/passenger/requests/active` | Sin owner/accountId: principal autenticado | HTTP 200, PassengerTrip activo completo o null |
| GET `/v1/passenger/requests/:id` | — | PassengerTrip autoritativo |
| POST `/v1/passenger/requests/:id/commands` | TripCommand: tripId, commandId, name=`cancel`, payload.reason=`user/edit/schedule` | PassengerTrip confirmado |
| GET `/v1/passenger/requests/:id/changes?afterRevision=N` | Revision conocida | Sólo revision, no snapshot |
| GET `/v1/driver/state` | — | DriverState autoritativo |
| GET `/v1/driver/changes?afterRevision=N` | Revision conocida | Sólo revision |
| POST `/v1/driver/availability` | availability=`AVAILABLE/OFFLINE`, operationId | DriverState confirmado |
| POST `/v1/driver/location` | coordinate=[lng,lat], heading opcional válido, operationId | DriverState confirmado |
| POST `/v1/driver/offers/:id/accept` | actionId | DriverState confirmado |
| POST `/v1/driver/offers/:id/reject` | actionId | DriverState confirmado |
| POST `/v1/driver/assignments/:requestId/cancel` | actionId | DriverState confirmado |

Errores: 401 credencial ausente/inválida, 403 role/ownership, 400 entrada
inválida, 404 recurso inexistente, 409 conflicto/idempotencia/precondición,
503 matching/configuración/almacenamiento no disponible. No se devuelve el
token ni el body de TomTom en errores o logs.

`matchingAvailable` exige auth + provider configurado + pricing listo. Cash/
`paymentReady` conserva su independencia. Quotes anónimas siguen permitidas
para geospatial/tests, pero no pueden crear requests. Operaciones de quote
autenticadas se separan por owner y operationId. La request exige quote priced,
owned y vigente; congela su snapshot y no vuelve a cotizar durante matching.

## Estado y concurrencia

- Request: `SEARCHING → ASSIGNED | CANCELLED | NO_DRIVER_FOUND`.
- Como máximo una SEARCHING o ASSIGNED por owner, mediante índice persistido
  `activeRequestByOwner`. Create resuelve primero idempotencia; una intención
  nueva con activa recibe 409 `active_request_exists` antes de consultar quote.
  Request, requestIds e índice se escriben en el mismo commit. Cancel y deadline
  liberan autoridad antes de otra creación; ASSIGNED/reasignación la conservan.
- Passenger cancela sólo SEARCHING. Driver cancela su assignment y devuelve
  la misma request a SEARCHING (o NO_DRIVER_FOUND si ya venció el deadline),
  elimina assignment y queda excluido para siempre de esa request.
- Deadline fijo: creación + 15 minutos. Reasignar renueva sólo searchStartedAt.
  60/120 segundos son proyecciones UI locales (`expanding/prolonged`), sin
  mutaciones/revisions server. Una búsqueda reiniciada comienza `reassigning`.
  NO_DRIVER_FOUND reutiliza `expired`; el móvil no fabrica expiración.
- Oferta: ACTIVE → ACCEPTED/REJECTED/EXPIRED/REVOKED. TTL 20 segundos (acotado
  por el deadline). Máximo dos por grupo, ordenadas por ETA real a pickup.
  Una oferta ACTIVE global por Driver y una única invitación por request.
- Reject no suma expiraciones. Tres expiraciones pausan la sesión de
  disponibilidad; sólo AVAILABLE explícito reinicia el contador. No auto-resume.
- Un único MatchingCoordinator por gateway serializa commits. Aceptar revoca
  las otras ofertas. First-commit-wins resuelve accept/accept, cancel/accept,
  expiry/accept y las mutaciones de disponibilidad/asignación.
- Selección de candidatos/generación bajo lock; TomTom fuera; regreso al lock
  con revalidación de request revision/state/deadline, Driver revision,
  locationRevision, disponibilidad, exclusiones y oferta activa. Una ETA lenta
  no bloquea otra request. Resultados stale se descartan y replanifican.
- Sin candidatos, espera hasta disponibilidad/location nueva o deadline.
  Si falla el proveedor para todos los candidatos, reintento técnico a 5 s.
  Scheduler programa la próxima expiración/deadline; no usa el cleanup geo.
- Driver: `OFFLINE | LOCATING | AVAILABLE | PAUSED | ASSIGNED`. La intención
  AVAILABLE sólo produce AVAILABLE si ya existe una muestra fresca; en otro
  caso produce LOCATING. Una ubicación real válida confirma LOCATING→AVAILABLE
  en el mismo commit. Matching exige AVAILABLE y una muestra de menos de 60 s.
- El scheduler incluye exactamente `receivedAt + 60 s`. Al vencer, AVAILABLE
  pasa a LOCATING y una oferta ACTIVE se revoca; la request aumenta revision y
  conserva al Driver en `offered`. OFFLINE/PAUSED/ASSIGNED no cambian por TTL.
- Driver DEV usa una única sesión `watchPositionAsync` mientras está LOCATING o
  AVAILABLE, enfocada y en foreground. Puede bootstrappear con last-known sólo
  si es válida y tiene menos de 60 s. Un watchdog de 10 s limpia el watcher
  silencioso y reintenta a los 3 s. Blur/background/unmount u otro estado lo
  detienen. Cada muestra lleva operationId nuevo; heading inválido se omite.

## Persistencia y recuperación

`VIMA_GEO_RUNTIME_DIR/matching-v1.json` (default `.runtime`) es un snapshot
versionado. Cada commit escribe temporal, fsync y rename antes de responder o
notificar. Un error de escritura cierra el coordinador a nuevas operaciones.
Ejecutar **un solo proceso** contra ese archivo; no se ofrece coordinación
entre procesos, máquinas ni workers.

Persiste requests/revisions/requestId index, quote congelada, timestamps,
offered/excluded, ofertas, assignment, recibos idempotentes y disponibilidad/
contador/revisions de Driver. Snapshot schema v3 guarda únicamente la última
location dentro de `DriverRecord` (coordinate, heading opcional, receivedAt y
revision); no hay Map paralelo ni historial de ubicación. `DriverState.location`
se deriva de ese registro. Los perfiles se reconstruyen desde auth config; los
bearer tokens nunca entran al snapshot.

El archivo conserva el nombre compatible `matching-v1.json`, pero su campo
`version` es 3. La migración v1→v2 es determinista: un AVAILABLE legado sin location
persistida pasa a LOCATING y sus ofertas ACTIVE se revocan sin borrar requests,
assignments ni recibos idempotentes. Corrupción real continúa fallando cerrada.
Una location v2 fresca sobrevive restart; startup/sweep convierte una vencida a
LOCATING antes de ofertar.

La migración v2→v3 construye `activeRequestByOwner` determinísticamente:
una sola ASSIGNED tiene prioridad; sin ASSIGNED se conserva SEARCHING más
antigua por createdAt/id. Las otras SEARCHING pasan a CANCELLED con revision
nueva y sus ofertas ACTIVE se revocan, incrementando Driver revision. Se
preservan todos los records, quotes, assignments, actions/recibos, requestIds,
offered/excluded y Driver records. Dos ASSIGNED por owner fallan cerrados.
El validador v3 exige correspondencia completa y única entre índice, owner y
requests activas existentes. No repara silenciosamente un índice v3 inválido.

El startup valida versión/schema/invariantes y procesa expiraciones con el
reloj actual antes de servir matching. Archivo corrupto/ilegible falla cerrado.
No borrar `.runtime` para resolver un error de lectura: conservarlo, parar el
gateway y restaurar una copia consistente. Guardar los mismos accountId en auth
al reiniciar; eliminar cuentas referenciadas invalida la recuperación.

requestId se indexa por principal. Repetirlo con la misma quote retorna la misma
request; cambiar quote produce conflicto. commandId/operationId/actionId
conservan fingerprint y resultado confirmado aun tras restart. Reintentar una
acción ambigua con el mismo ID; una respuesta antigua no reemplaza revisions
nuevas en Query. PIN de cuatro dígitos se genera criptográficamente en server.
Una creación Passenger ambigua conserva ID y quote originales aun si la query
renueva la cotización: Reintentar reconcilia ese intento antes de permitir
abandonar/editar el draft. Un rechazo HTTP definitivo libera el intento. Driver
también conserva actionId sólo mientras la respuesta sea ambigua, evitando
quedar bloqueado al recibir un rechazo definitivo de una oferta ya vencida.

Passenger server bloquea creación hasta resolver bootstrap `/active` online.
El snapshot recuperado se siembra sólo en `tripKey(active.id)`, comparando
revisions de ese mismo ID; tripId cambia explícitamente. Una activa distinta
de la local no terminal produce violación de identidad. Null no borra una
request local: su GET/realtime resuelve el estado. Reconnect sin tripId repite
bootstrap; con request conocida sigue realtime. `active_request_exists` durante
create consulta `/active` y adopta por la misma regla, sin nuevo ID ni éxito
optimista; otros 4xx conservan su semántica. `reconcileTrip` sigue estricto.

## Provenance y oferta visible

`matchingTrace` del servidor permite capturar eventos estructurados; el default
es JSON en consola. Los eventos se emiten después de persistir, antes de
notificar invalidaciones. Un fallo del logger no modifica la autoridad.
`request_active`/`request_terminal` identifican request, owner, state y revision;
`offer_commit` añade offerId, driverId, requestRevision, driverRevision y expiresAt;
`driver_state_offer` registra el GET con offerId, requestId, driverId, revision y
expiresAt. Sin quote, coordenadas, ruta, bearer, perfiles ni placa.

Todos los `poll_*` llevan pollId, stream (`driver`/`passenger_request`) y entity
(`driver`/tripId), sin cambiar backoff ni coalescing. El render DEV de oferta
emite `offer_render` con offerId/requestId/revision/expiresAt al cambiar esos
campos, no con ticks. La cadena correlacionable es offer_commit → poll_invalidation
→ driver_state_offer → offer_render. Countdown, pickup, ETA y ambos botones son
una región prioritaria fuera de ScrollView; expiración deshabilita acciones.

OperationIds Driver incluyen availability_available/availability_offline,
location, offer_accept/offer_reject o assignment_cancel; pending conserva el ID
en retry ambiguo. Cada transición real de disponibilidad registra driverId,
from/to/reason/revision. Razones: explicit_available, explicit_offline,
location_fix, location_ttl, offer_accept, offer_expiry_pause, assignment_cancel
y snapshot_migration. El helper prohíbe OFFLINE sin explicit_offline y commit
rechaza cambios sin provenance. No se persiste una segunda autoridad para logs.
Background/unmount sólo controla transporte/location local: nunca OFFLINE.

Implementación y pruebas automatizadas completadas; **Android físico pendiente**
para identidad activa/cancel→crear, oferta ~20 s sin scroll/cadena de trazas y
Driver estacionario AVAILABLE >60 s/OFFLINE exclusivamente explícito.

## Invalidaciones y reconexión

Long-poll limitado a 25 s. Revision mayor que afterRevision responde de
inmediato; de otro modo espera cambio/timeout/abort. No hay event queue ni
WebSocket. Passenger usa RealtimeTransport → invalidateQueries →
tripQueryOptions GET → reconcileTrip. Driver hace fetch tras invalidación y
compara revision. Los recibos de comando también pasan por esa comparación.

El cliente limita la petición poll a 30 s y reintenta con backoff de 0.5 a 15 s;
al reconectar invalida y obtiene un GET autoritativo. Abortar/desmontar termina
poll y espera de backoff. Antes de tener tripId, recupera conectividad mediante
un probe de sesión a 5 s sólo mientras hay suscriptores y está desconectado.

## Preparación de dos dispositivos (HTTPS obligatorio)

1. Usar el Development Build existente. Abrir una terminal en el repositorio.
   Mantener el JSON comercial de pricing y key TomTom ya aprobados fuera de Git.
2. Crear `.runtime/auth.local.json` (gitignored) con este schema, sustituyendo
   placeholders por cuentas de QA y perfiles/vehículo reales autorizados:

   ```json
   {
     "accounts": [
       { "accountId": "passenger-qa", "role": "passenger", "token": "TOKEN_ALEATORIO_PASSENGER" },
       {
         "accountId": "driver-qa", "role": "driver", "token": "TOKEN_ALEATORIO_DRIVER",
         "driver": { "name": "NOMBRE_REAL_AUTORIZADO", "rating": 4.5 },
         "vehicle": { "name": "VEHICULO_REAL", "plate": "PLACA_REAL", "color": "COLOR_REAL" }
       }
     ]
   }
   ```

   Rating es un ejemplo de schema, no un dato a copiar. Usar el valor autorizado.
   Cada token debe ser diferente, aleatorio y de 32–128 caracteres sin espacios.
   Se pueden generar y guardar directamente, sin imprimirlos, después de editar
   los perfiles del archivo:

   ```powershell
   $authPath = Join-Path $PWD '.runtime/auth.local.json'
   $auth = Get-Content -Raw -LiteralPath $authPath | ConvertFrom-Json
   foreach ($account in $auth.accounts) {
     $account.token = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   }
   $auth | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $authPath -Encoding utf8NoBOM
   ```

3. Configurar sólo en el proceso servidor y arrancarlo (reemplazar la ruta de
   pricing por la real; no cambiar fórmula ni copiar rates a variables públicas):

   ```powershell
   $env:VIMA_AUTH_CONFIG_PATH = (Resolve-Path '.runtime/auth.local.json').Path
   $env:VIMA_PRICING_CONFIG_PATH = 'C:\RUTA_EXTERNA\pricing.aprobado.json'
   $env:TOMTOM_API_KEY = (Get-Content -Raw -LiteralPath 'C:\Users\nexar\Documents\Credenciales\Transporte\tomtom_api_key.txt').Trim()
   $env:VIMA_GEO_HOST = '127.0.0.1'
   npm run geo:gateway
   ```

4. Exponer ese gateway mediante un proxy TLS ya autorizado con certificado
   válido y hostname resoluble/confiable **en ambos teléfonos**. No se ha
   provisionado infraestructura externa en esta rama. Configuración equivalente
   del proxy: forward de `/v1/` y `/health` a `http://127.0.0.1:8787`, conservar
   `Authorization`, timeout de lectura ≥35 s, sin cache/buffering de long-poll,
   sin logs de Authorization. Node sólo escucha loopback. No desactivar validación
   TLS ni usar bearer sobre LAN HTTP. Abrir `/health` por HTTPS desde cada móvil.
5. En otra terminal (reemplazar hostname por el HTTPS real):

   ```powershell
   $env:EXPO_PUBLIC_VIMA_API_BASE_URL = 'https://HOSTNAME_HTTPS_CONFIABLE'
   $env:EXPO_PUBLIC_VIMA_FIXTURES = ''
   npm start -- --clear
   ```

6. A abre `/dev/passenger`; B abre `/dev/driver` desde el enlace técnico del gate.
   Pegar el token correspondiente una vez y pulsar **Guardar y conectar**.
   Se guarda sólo en SecureStore. El menú Expo Development Client → **Cuenta de
   prueba Vima** permite cambiar/limpiar cuenta; los controles no ocupan el
   viewport Passenger. El gate verifica role y capability contra el backend.
7. B pulsa Disponible y concede ubicación. Puede mostrar **Localizando…** hasta
   confirmar una muestra real; después `/v1/driver/state` debe mostrar AVAILABLE,
   `location.coordinate` y `location.receivedAt`. Mantener esa superficie en foreground.
   A elige un viaje dentro de la cobertura comercial, confirma ubicaciones,
   obtiene quote priced vigente y solicita. B debe recibir una oferta con
   countdown/ETA/pickup; aceptar antes del TTL. Comparar assignment (nombre,
   vehículo, ETA y estado; Driver muestra también ID). No avanzar el lifecycle.

## Evidencia y checklist físico

Automatizado: carreras, TTL/deadline, rechazo/pausa/reasignación, ETA fuera del
lock y stale, ownership, idempotencia/restart/corrupción, long-poll/reconexión,
reconcile de revisions y E2E HTTP con adapter de ruta inyectado. Ese E2E usa
cuentas efímeras y pricing sintético; **no certifica TomTom live/comercial ni TLS
físico**. En esta sesión no estaban configurados auth/pricing/key en el entorno
servidor, ni se disponía de HTTPS/dispositivos físicos. E2E con TomTom real queda
pendiente de esa configuración; no se inventaron cuentas/perfiles comerciales.

| Escenario físico | Estado |
|---|---|
| Driver LOCATING → AVAILABLE + ubicación válida | PENDIENTE |
| Passenger quote live/priced → request | PENDIENTE |
| Oferta → accept → ambos con el mismo assignment | PENDIENTE |
| Oferta sin respuesta expira a los 20 s | PENDIENTE |
| Passenger cancela antes de assignment | PENDIENTE |
| Driver cancela → misma request busca; Driver excluido | PENDIENTE |
| Pérdida/reconexión converge sin éxito optimista | PENDIENTE |
| Restart gateway recupera estado y ambos convergen | PENDIENTE |
| Tres expiraciones → PAUSED; resume explícito | PENDIENTE |
| Dos accepts concurrentes | PASS automatizado; físico requiere Passenger + 2 Drivers |

Para expiry/reject/cancel usar requests nuevas: un Driver nunca recibe de nuevo
una request ya ofrecida. Tras Driver cancel, validar un nuevo assignment físico
requiere otro Driver elegible. Con sólo A+B se valida la vuelta a búsqueda y la
exclusión, no un segundo assignment. Reiniciar usando los mismos directorio y
auth config. Los perfiles/keys/tokens reales no se adjuntan a reportes ni Git.
