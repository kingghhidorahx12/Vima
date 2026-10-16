# D2 — Driver con sesión OTP de producto

Implementación local sobre D0/D1 y HEAD `55e004e`, en
`codex/product-phone-auth-p1-1`. Sin aprobar cuentas reales ni publicar.

## Entrada y recuperación

Perfil revalida `/me`. Sólo muestra «Entrar a Driver» con capacidad Driver.
`/driver` vuelve a validar `/me` y consulta DriverState con el mismo access token,
contexto `driver`, identidad coincidente y vehículo completo. Una cuenta Passenger
sin aprobación recibe 403; ninguna flag de navegación concede capacidad.

La excepción D1 de un viaje activo permite recuperar Driver aunque `/me` ya no
devuelva capacidad general. El contexto guardado en SQLite es una pista por cuenta,
no autorización: la reapertura Passenger redirige a Driver para recuperar estado
del servidor antes de operar. Cambiar cuenta no adopta la pista de otra identidad.
Un 403 presenta acceso retirado/reintento/Passenger, sin borrar la sesión OTP.
Un error de red conserva sesión y no declara disponibilidad/desconexión confirmada.

`DriverOperationalSurface` es la superficie extraída de DriverLiveScreen. QA sigue
envolviéndola con LiveAccountGate; producto usa sólo productAuthClient. Ubicación,
mapa, ofertas, actions, lifecycle, PIN, journal y efectivo siguen siendo los mismos.
No se añadieron rutas servidor ni se cambió una decisión/contrato D1.

## Contexto y cancelación

- Transporte propio por montaje/contexto con AbortControllers para todas las
  operaciones, incluidas las que no proporcionan signal. Comprueba generación de
  sesión antes y después de await. Cerrar contexto cancela requests y rechaza
  resultados tardíos; un nuevo contexto no reutiliza ese transporte.
- QueryClient propio Passenger y Driver; se cancela/limpia al desmontar. No se
  comparten trip/driver caches entre roles o cuentas. Refresh de tokens conserva
  identidad; logout/expiración/cambio de cuenta desmontan el subárbol protegido.
- Journal Driver producto: `vima.product.driver-journal.v1.<accountId>`.
  QA conserva exactamente su key anterior. Las entradas conservan IDs e identidad
  de assignment; GET autoritativo antes de replay sigue siendo obligatorio.
  Una cola compartida por storage/cuenta serializa las escrituras producto entre
  montajes; reabrir espera una escritura nativa anterior y no pierde secuencias.
  No se borran intenciones durables por un error transitorio o un cambio de pantalla.
- Foreground y revalidación periódica de 25 s refrescan capacidades y DriverState;
  las validaciones periódicas no se superponen y se cancelan al desmontar.
  El servidor D1 bloquea operaciones inmediatamente, sin esperar ese refresco visual.

## Salida, restricciones y cuenta

Cambiar a Passenger o abrir Cuenta y sesión desde Driver consulta DriverState.
Con asignación activa no sale: informa que debe terminar el viaje/efectivo.
Sin asignación solicita OFFLINE y exige respuesta OFFLINE sin assignment.
Reintenta una desconexión ambigua con el mismo operationId; no navega ante fallo.
Durante el intento bloquea nuevas interacciones visuales. La pista de contexto
se elimina sólo al confirmar salida o tras un 403 de autorización vigente.
Cuenta también respeta esa pista, para no ofrecer logout normal saltándose la salida.

Suspensión/revocación con viaje conserva controles lifecycle, GPS/telemetría y
efectivo autorizados por D1; oculta cancelar asignación al refrescar capacidades.
No se restauran ofertas ni elegibilidad. Bloqueo de seguridad produce 403 incluso
durante viaje y retira la superficie operativa; no se transforma en suspensión normal.
401 definitivo limpia sesión por el mecanismo P1.1 existente; offline no hace logout.

Perfil Driver sin rating muestra «Nuevo conductor · Sin valoraciones». Ratings
numéricos QA/históricos siguen siendo reales. Sin edición de vehículo, ganancias,
documentos, aprobación pública ni otra funcionalidad ilustrada.

## Validación y D3

Regresiones D2: gate real aprobado/Passenger/excepción activa, logout, transporte
por contexto y respuestas tardías, 403 vs offline, OFFLINE idempotente y viaje
activo, `/me` fresco, reutilización del controlador y separación QA/journal.
Las pruebas D1 siguen cubriendo autorización, revocación, carreras, PIN, efectivo
y reinicio de snapshots contra el Gateway real local con OTP simulado.

Resultados: suite completa **446/446 PASS**, Gateway **90/90 PASS**, focales
Driver/journal **18/18 PASS**. TypeScript, lint, worklets y diff-check PASS.
Export local Hermes Android/iOS con caché limpia: PASS. Aislamiento release de
servidor/paths/fixtures y presencia de contexto/HTTPS productivo en ambos bundles:
PASS. Tests usan OTP/ubicaciones simulados; no verifican cuentas ni SMS nuevos.
QA físico D2/D3 PENDIENTE.
Antes de D3: desplegar D1 compatible con autorización posterior, mantener una sola
réplica/escritor y probar administración privada/volumen Linux. Ambos teléfonos
deben ejecutar cliente con capacidad doble/rating null antes de aprobar una cuenta
real. Hace falta autorización explícita de esa aprobación y de toda publicación.

Checklist dos Android sin USB/Metro, una vez autorizada la entrega:

1. Passenger sin Driver: no entrada autorizada; deep link Driver devuelve rechazo.
2. Cuenta aprobada: entrar con el mismo OTP, nombre/vehículo/rating reales y ambos temas.
3. Disponible → Passenger: OFFLINE confirmado; modo avión durante salida conserva
   Driver y permite reintentar sin afirmar éxito. Volver a Driver recupera estado.
4. Oferta, aceptar/rechazar, recogida, PIN, viaje y efectivo; matar/reabrir y reconectar
   recupera assignment sin duplicar comandos. No salir con viaje activo.
5. Suspender sin viaje/con oferta/con viaje; revocar y bloquear seguridad por separado.
   Comprobar retiro de acceso, excepción para finalizar y no recibir otro trabajo.
6. Expirar sesión, logout y otra cuenta; ninguna muestra/receipt/respuesta anterior
   reaparece. QA por token mantiene aislamiento y su journal anterior.

Sin dependencias/cambios nativos; no se requiere nuevo Development Build por D2.
Export local Hermes no es un APK ni una publicación OTA. Un request ya confirmado
en servidor no se deshace por abortar JS: siempre manda la reconciliación del servidor.

## Archivos D2

- `app/driver.tsx`, `src/features/driver/ProductDriverScreen.tsx`,
  `DriverOperationalSurface.tsx`, `DriverAccountPanel.tsx`, `DriverMapPanel.tsx`.
- `src/dev/driver/DriverLiveScreen.tsx`, `useDriverLifecycle.ts` (reuse/journal).
- `src/services/auth/productRole.ts`, `productSession.ts`,
  `src/services/matching/driverJournal.ts`.
- `src/features/auth/ProductAccountScreen.tsx`,
  `src/features/passenger/ProductPassengerScreen.tsx`.
- `tests/product-driver.test.ts`, `product-integration.test.ts`; guards de Driver
  existentes ahora inspeccionan el controlador extraído, conservando sus assertions.
- PROJECT_STATE, DECISIONS y esta guía. D0/D1 y los dos logs QA preservados.
