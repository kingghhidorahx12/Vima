# D3 — Auditoría y QA integrado Driver productivo

Fecha: 2026-10-15. Rama `codex/product-phone-auth-p1-1`, HEAD sin mover:
`55e004ed5d2588a7fa3704f1ae345c3c11d743c3`.
D0/D1/D2 son cambios locales sin commit; esta auditoría no los publica.

**Resultado: CON OBSERVACIONES para preparar una entrega controlada.**
La integración automatizada pasa. El alta del primer Driver real sigue bloqueada
hasta desplegar Gateway compatible, actualizar los teléfonos e inspeccionar la
versión que realmente ejecutan. QA físico D1/D2/D3 PENDIENTE; iOS PAUSADO.
No se aprobó una cuenta real, ni se hizo commit, push, despliegue, OTA o APK.

## Alcance y evidencias

Se revisaron diff tracked, archivos nuevos, contratos efectivos, administración,
auth, coordinator, HTTP, decoders, sesiones, navegación, cachés y journal. Se
preservó D0 y se compararon hashes anteriores/posteriores de los archivos locales.
Los dos logs QA conservan su contenido y siguen untracked; no forman parte de D3.

El harness `tests/support/product-driver-fixture.ts` inicia Gateway y listener
administrativo reales en puertos efímeros de localhost con storage temporal.
Registra dos cuentas mediante los endpoints OTP productivos, sin `createAuthConfig`
ni tokens QA. Sólo proveedor OTP y proveedor de ruta se simulan; las tarifas son
fixtures explícitos de test procesados por el motor vigente. No prueba SMS real,
GPS Android, render nativo ni precios comerciales. Reloj controlado para muestras
y plazos; las peticiones HTTP, autorización, persistencia y CLI son reales.

## Hallazgos

### P1 corregido: salida aceptaba un recibo OFFLINE histórico

Reproducción anterior al fix, tanto unitaria como por HTTP:

1. OFFLINE se confirma en servidor, pero se pierde la respuesta.
2. El Driver vuelve a disponibilidad y recibe otra oferta.
3. Se reintenta salir con el mismo operationId; una aceptación gana la carrera.
4. El servidor devuelve correctamente el recibo OFFLINE original. D2 lo tomaba
   por estado actual y permitía salir a Passenger pese a la nueva asignación.

`driverExit` ahora consulta DriverState después del recibo y exige OFFLINE **actual**
sin assignment. Una respuesta perdida, error o asignación conserva Driver.
El operationId permanece estable; no cambia idempotencia servidor, lifecycle ni
matching. Los dos tests de reproducción fallaban con la implementación anterior
y pasan con el fix; el recorrido HTTP comprueba que ASSIGNED no se pierde.

### P1 de publicación: Passenger antiguo no admite rating null

La regresión ejecuta el decoder real de HEAD `55e004e`, obtenido con `git show`
y compilado en memoria: rechaza el snapshot válido con `rating: null` y acepta
el mismo snapshot con rating numérico histórico. Es una incompatibilidad real,
no se debe sustituir null por 0/5 ni modificar snapshots para ocultarla.

Gateway D1 puede publicarse primero mientras ninguna cuenta tenga Driver: no
produce assignments nuevos con rating null. Antes de la primera aprobación deben
ejecutarse los clientes D1/D2 en **todos los teléfonos Passenger participantes**.
Una OTA publicada/descargada no demuestra que esté en ejecución. Comprobar su ID
en «Acerca de Vima». El preview controlado permite inventariar los dos teléfonos;
el código no impone una versión mínima remota a una flota pública desconocida.
Ampliar el rollout sin ese inventario requeriría resolver ese control previamente.

### Límites operativos, sin cambio de contrato

- Bloqueo de seguridad D1 impide también operar un viaje activo; no lo finaliza
  automáticamente. Su recuperación requiere intervención operativa separada.
- Ese bloqueo es de autoridad **Driver**. No equivale a bloquear toda la identidad
  OTP Passenger ni a revocar globalmente todas sus sesiones. Se verificó el 401 de
  una sesión revocada mediante logout y el 403 de Driver comprometido bloqueado.
  D1 no incorpora una consola de recuperación de cuenta/global session revocation.
- El actor durable es `gateway-operator`; la atribución humana depende del acceso
  SSH y control del secreto privado. No existe un directorio nuevo de administradores.
- Se mantiene una réplica/un escritor; no hay lock distribuido ni soporte multiinstancia.
- Una operación confirmada antes de abortar JS puede persistir. La reconciliación
  autoritativa y el journal resuelven el resultado; abortar no revierte el servidor.

## Matriz de auditoría y regresiones

| Caso | Resultado | Evidencia / límite |
| --- | --- | --- |
| Registro nuevo sólo Passenger; cuenta anterior conserva identidad/tokens | PASS | D1 migration + product session/HTTP |
| Passenger fuerza contexto Driver en cada endpoint Driver | PASS | D3: state, changes, session, availability, location, accept, reject, commands, telemetry, cancel: 403 |
| Contexto ausente/incorrecto y autoridad QA separada | PASS | D1 HTTP y matching-client; no fallback QA en producto |
| Quotes/requests Passenger y ownership | PASS | Router y coordinator; suite Gateway/matching; contexto Driver no concede acceso Passenger |
| Capacidad/perfil completos y vigentes, incluso en sesión previa | PASS | `/me` fresco, autorización dentro de commit, vehículo requerido e inmutable |
| Administración privada, autenticación, body inválido y replay | PASS | D1 listener; D3 ejecuta CLI real por stdin dos veces, una decisión durable |
| Migración v1→v2, backup y rollback conservando refresh/logout actuales | PASS | D1: backup previo, tokens originales válidos; no revive refresh/sesión revocados |
| Corrupción, referencias/auditoría incoherentes y fallo de escritura | PASS | D1 fail closed; no store vacío ni concesión en memoria; readiness 503 |
| Suspendido/revocado sin viaje y con oferta | PASS | 403, retirada durable, no aceptación tardía, reinicio sin nueva elegibilidad |
| Carrera suspensión/revocación vs aceptación | PASS | D1 orden determinista en coordinator + D3 dos órdenes HTTP concurrentes; resultado según commit ganador |
| ETA calculada antes de suspensión | PASS | D1 vuelve a validar antes de publicar oferta |
| Caída entre auth durable y retirada matching | PASS | D1 reinicio reconcilia antes de ofertar |
| Suspendido/revocado con assignment | PASS | Sólo continuidad autorizada; PIN, telemetría, finalización y efectivo, luego sin nuevos trabajos |
| Bloqueo de seguridad separado | PASS | Deniega incluso viaje activo; approve no elimina bloqueo; unblock no reaprovisiona permisos |
| Snapshots, receipts y vehículo históricos tras revocar | PASS | D1 reconstrucción/reinicio; D3 terminal/replay efectivo tras reinicio |
| Journey OTP productivo completo | PASS | D3 dos recorridos: normal y suspendido con asignación |
| PIN incorrecto/correcto y no exposición en snapshot Driver | PASS | D3: incorrecto 409, correcto IN_PROGRESS; PIN sólo Passenger |
| Telemetría fresca visible en Passenger | PASS | D3 secuencias 1/2; snapshot Passenger actualiza coordenada real del fixture |
| Respuesta perdida al terminar + replay journal | PASS | D3 GET/replay, mismo commandId; PAYMENT_PENDING y precio cotizado coherente |
| Cambio de rol con viaje activo / OFFLINE ambiguo | PASS | D2 gate real y D3 recibo histórico; no salida falsa ni assignment perdido |
| Cachés, cancelación, journal, cuentas y respuestas tardías | PASS | D2 gates/transport, namespace producto/cuenta; cola entre remontajes y tests journal |
| Logout, refresh concurrente/rechazado, expiración y offline | PASS | Product session/integration; 401 desmonta, red transitoria conserva credenciales |
| Rating null/count 0, numérico QA y UI ambos temas | PASS | Decoders actuales + presentación Passenger/Driver existentes |
| Decoder Passenger anterior con rating null | FAIL esperado | Incompatibilidad demostrada; condición de publicación, no se tolera un snapshot inválido |
| SSH, filesystem durable y una réplica Railway | PASS inspección | Sólo lectura; detalle abajo. Migración/listener D1 en Railway aún PENDIENTES |
| SMS/GPS/gestos/render/cambios de rol reales en dos Android | PENDIENTE | No sustituir pruebas físicas por HTTP o renderer de test |

## Viaje integrado reproducido

Los tests D3 verifican ambos snapshots en la cadena:

`SEARCHING → ASSIGNED → ARRIVED_PICKUP → IN_PROGRESS → PAYMENT_PENDING → COMPLETED`.

La misma sesión OTP previa a la aprobación obtiene capacidad vigente sin otra
cuenta. El Driver pasa por LOCATING y location válida antes de recibir oferta.
Aceptar dos veces devuelve el mismo recibo. Passenger obtiene PIN, posición fresca
y solicitud activa; Driver recibe perfil/vehículo y estado operativo sin PIN secreto.
Se reinicia Gateway durante IN_PROGRESS y se recrean clientes desde su storage.
No hay nueva solicitud/assignment. Finalización con respuesta perdida se recupera
por el journal; settlement conserva la tarifa de la cotización. Efectivo termina
el viaje, `/active` queda vacío y los snapshots/receipts sobreviven otro reinicio.
Al suspender durante assignment, cancelar/nueva disponibilidad se rechazan; sí
se completa el viaje/efectivo y al terminal desaparece la excepción Driver.

## Railway: viabilidad inspeccionada, sin modificaciones

Servicio y configuración observados el 2026-10-15:

- Proyecto `Vima-Product-Preview`: `ccb266b6-8ede-4fc1-911f-95d23d5cf79f`.
- Entorno `production`: `28554c15-d300-4d33-8934-02bd5d86723e`.
- Servicio `vima-gateway-product`: `d17b5fe0-2aca-4d14-8382-76542b72f879`.
- Fuente fijada todavía a `3afef0d52b66cc40864369206a8137ab6c2fda3f`, deployment
  `300907d8-23fa-4a83-812b-17311cb70684` SUCCESS. No contiene D1/D2 locales.
- Node `v22.23.3`, `/app`, start `node --experimental-strip-types gateway/main.ts`.
- Una réplica en iad; inspección SSH encontró un único proceso Gateway.
- Volumen `vima-product-data`, 500 MB, `/data`; runtime `/data/product`.
  `auth-v1.json` existe y sigue en schema v1. No se leyó/publicó su contenido.
- HTTPS `https://vima-gateway-product-production.up.railway.app`; GET `/ready`: 200.
- Modo local y Twilio vigentes; secreto administrativo todavía ausente.
- Sin proxy TCP para listener privado, sin cambios staged. Vima-QA no modificado.

SSH con la clave ya registrada permite comandos en el contenedor activo; se
verificó por comandos de sólo lectura. La CLI administrativa se probó contra el
Gateway local activo, no contra Railway. Para operar en Railway hace falta publicar
D1 y configurar `VIMA_DRIVER_ADMIN_SECRET` privado; puerto loopback por defecto
8790. No hace falta servicio público ni segundo proceso escritor. La plataforma
admite comandos/entrada estándar y forwarding al loopback según su
[documentación SSH](https://docs.railway.com/cli/ssh).

El volumen requiere un solo despliegue montado/escritor. Railway documenta la
ausencia de despliegues solapados con volumen y la pausa asociada al cambio de
deployment; `/ready` se consulta durante el despliegue y no es un monitor continuo.
Ver [healthchecks y volúmenes](https://docs.railway.com/deployments/healthchecks).
Mantener esa configuración; no lanzar Gateway paralelo por SSH. D3 no ejecutó
una migración ni un reinicio en Railway.

## Orden de publicación futura y condiciones de parada

Estos pasos son un plan; requieren autorización posterior y no se ejecutaron.

1. Crear checkpoint revisado D0/D1/D2/D3 y fijar SHA inmutable. No usar el HEAD
   anterior como si ya incluyera cambios locales. Reservar ventana sin viajes
   activos ni comandos pendientes, pausar nuevos trabajos y tomar respaldo
   coherente del volumen con el escritor detenido. Incluir auth, matching y
   configuración/tarifas vigentes; no importar identidades ni viajes de Vima-QA.
2. Publicar **Gateway primero**, desde ese SHA, una réplica con `/data` y runtime
   existentes. Conservar `VIMA_PRODUCT_AUTH_SECRET`, tarifas y routing `fast`.
   Configurar secreto administrativo privado separado, sin endpoint público.
   Inicio valida v1, respalda `auth-v1.before-v2.<uuid>.json`, migra y recupera
   matching antes de `/ready` 200. Ante error de schema/storage: detener rollout,
   mantener 503 e investigar; nunca regenerar un store vacío.
3. Verificar por SSH schema v2, backup, permisos, un escritor y listener loopback;
   comprobar `/ready`, sesión Passenger previa y persistencia tras reinicio
   controlado autorizado. Probar rechazo administrativo sin credencial sin
   conceder permisos. Ninguna cuenta Driver se aprueba todavía.
4. Preparar OTA Android **sólo `product-access-preview`**, environment `production`,
   runtime `0.0.2` (`appVersion` actual). Exportar con caché limpia, comprobar
   HTTPS efectivo y aislamiento, publicar/verificar bundle servido según workflow.
   Sin cambios nativos/dependencias D1/D2/D3: no requiere nuevo APK por este alcance.
5. En ambos Android, descargar, cerrar/abrir y confirmar el ID OTA **en ejecución**
   en Perfil. Probar OTP existente, restauración y Passenger contra Gateway nuevo.
   **Parar si algún Passenger conserva decoder antiguo** o no se conoce su versión.
6. Sólo después y con autorización explícita, aprobar administrativamente el
   accountId OTP verificado y su vehículo completo mediante CLI en Gateway activo:
   `node scripts/driver-admin.cjs`, JSON privado por stdin. No editar JSON, usar
   tokens QA ni inferir aprobación desde el cliente. Reintentos con el mismo ID
   y payload; después consultar `/me`/DriverState actuales, no sólo recibos antiguos.
7. Ejecutar checklist físico y registrar evidencia/versiones. No declarar viaje
   productivo completo ni QA físico aprobado antes de realizarlo.

### Respaldo y rollback

La migración conserva cuentas y sesiones/token hashes; no rota credenciales.
Escrituras serializadas: archivo exclusivo temporal, fsync, rename y fsync del
directorio en Linux; estado en memoria sólo tras persistencia. Auth y matching
son dos archivos: el coordinador serializa la administración y el reinicio barre
ofertas con autoridad durable antes de aceptar tráfico listo. No es una transacción
multiinstancia. Los tests Windows no certifican pérdida de energía del volumen Linux.

**Antes de cualquier perfil/decisión Driver:** el rollback administrado
`node scripts/driver-admin.cjs rollback-passenger-auth` con `{}` por stdin archiva
el estado **actual**, escribe v1 con sesiones/revocaciones actuales y entra en
mantenimiento. Reiniciar con binario compatible v1. No regresar directamente al
binario viejo leyendo v2; reiniciar D1 vuelve a migrar v1 a v2.

**Desde la primera aprobación/perfil o evento administrativo Driver:** no es seguro
volver a v1 ni al cliente Passenger anterior. La operación de rollback v1 rechaza
409. Mantener binario/schema v2 compatible, conservar historial, assignments y
receipts; retirar nuevos trabajos y permitir terminar los viajes según D1 si se
necesita contener una incidencia. No restaurar el backup inicial: podría borrar
viajes o resucitar sesiones revocadas. Recuperación forense requiere detener el
escritor y reconciliar revocaciones; no constituye un rollback operativo automático.

## Validaciones ejecutadas

| Validación | Resultado |
| --- | --- |
| Suite completa `npm test` | **454/454 PASS**, sin skips/fallos |
| Gateway/matching/lifecycle/pricing `npm run test:gateway` | **90/90 PASS** |
| D1/D2/D3 + product session/integration focales | **53/53 PASS**, incluidos 8 nuevos D3 |
| TypeScript `npm run typecheck` | PASS |
| ESLint `npm run lint` | PASS, sin warnings en ejecución final |
| `check:worklets`, `check:splash` | PASS |
| Export limpio Hermes Android e iOS | PASS, sólo artefactos locales |
| Aislamiento release de servidor/tarifas/paths y fixtures QA | PASS en ambas plataformas |
| HTTPS productivo y contexto operativo en bytecode | PASS en ambas plataformas |
| `git diff --check`, preservación D0/logs y staging vacío | PASS |

Evidencia local ignorada: `.runtime/d3/` y `.runtime/d3-release/`. Hashes SHA-256
Hermes del export validado, **no publicado**:

- Android: `dfe8f91a285587365bb85dec7817612b3d79da9e6154550a6b3f18309938caf7`.
- iOS: `8e69f5c0ff63f911c2fc934f35f9778b2df3e0a6fb75a7569a2d4ec687d05b1d`.

## Checklist físico — dos Android sin USB ni Metro

Tras publicar bajo autorización y verificar OTA ejecutada en ambos:

1. Teléfono Passenger sin Driver: sesión vigente/restauración, Perfil sin entrada
   autorizada Driver; deep link no concede acceso. Light/Dark, safe areas y mapa.
2. Teléfono aprobado: mismo OTP, Driver y vehículo auténticos, «Nuevo conductor ·
   Sin valoraciones». Entrar/reabrir sin tokens QA ni segunda cuenta.
3. Conectar: permisos GPS, LOCATING → AVAILABLE sólo con location real. Ofrecer y
   rechazar/aceptar con acciones visibles; Passenger ve únicamente su sedán asignado.
4. Disponible → Passenger: OFFLINE confirmado. Cortar red durante salida: permanece
   Driver con recuperación, sin falso éxito. Reintentar; no oferta posterior offline.
5. Recogida: ruta real al origen, llegar, PIN incorrecto rechazado y correcto inicia.
   Comparar estados en ambos; no revelar PIN en datos Driver antes de ingresarlo.
6. Viaje: telemetría/heading frescos, modo avión y cierre/reapertura en Driver y
   Passenger; recuperar assignment, sin duplicar comandos. No cambiar de rol con
   viaje activo. Finalizar y cobrar efectivo una sola vez; terminal en ambos.
7. Con autorización administrativa específica, suspender sin viaje/con oferta/con
   assignment. No nuevos trabajos; retirar oferta; viaje activo terminable y sin
   permiso Driver tras efectivo. Revocación y emergencia son casos separados.
8. Logout, expiración definitiva, otra cuenta y respuestas tardías: no identidad,
   journal ni caché de otra cuenta. Offline transitorio conserva sesión. Recuperar
   pago pendiente tras desconexión sin volver a cobrar o finalizar otra asignación.

Cada caso queda PENDIENTE hasta registrar resultado físico. El cierre Android D0
5/5 de Passenger no verifica estos nuevos casos Driver.

## Archivos cambiados exclusivamente durante D3

- `src/services/auth/productRole.ts`: confirmación autoritativa tras recibo OFFLINE.
- `tests/product-driver.test.ts`: fixture de salida refleja disponibilidad confirmada.
- `tests/product-driver-d3.test.ts`: ocho regresiones, incluido decoder anterior real.
- `tests/support/product-driver-fixture.ts`: Gateway productivo local, OTP/ruta simulados.
- `docs/PROJECT_STATE.md`, `docs/DECISIONS.md` y este informe.

No se alteraron otros cambios locales D0/D1/D2, dependencias, configuración nativa,
tarifas, mapas, heading, Motion, PIN o reglas lifecycle/settlement durante D3.
