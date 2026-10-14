# Acceso y cuenta Vima P1 — implementación local 2026-10-13

## Cierre de bloqueos integrados — 2026-10-14

Implementado sobre los pendientes preservados: timeout por operación (long-poll
30 s), invalidación observable que desmonta Passenger y vuelve a OTP en 401
definitivo, y deadline de storage sin liberar prematuramente su cola nativa.
Producto puede ser la entrada de un bundle interno con
`EXPO_PUBLIC_VIMA_AUTH_MODE=product`; en ese modo las rutas QA/DEV con tokens
quedan cerradas. El perfil `product-preview` prepara un APK/canal aislado.
No se habilita Driver ni se mezclan autoridades. Configuración, procedimiento
Android y propuesta administrativa no implementada en
[PRODUCT_ACCESS_ROLLOUT.md](PRODUCT_ACCESS_ROLLOUT.md).

Mapas/heading/interpolación, lifecycle, PIN, pricing, backend y logs QA no cambian.
Sin commit/push/build/despliegue; SMS y QA físico continúan PENDIENTES.
Validación final: integración **12/12**, focal integración/media **17/17**, suite
**393/393**, TypeScript/lint, worklets, MapLibre/schema, splash, fixture isolation,
Hermes Android/iOS y aislamiento release PASS. Bundles de producto excluyen el
gate y namespace QA. Los 381/381 de la reanudación inferior son el antecedente.

## Reanudación auditada — 2026-10-14

Se inspeccionaron status/diff y los tres archivos indicados. Son archivos locales
sin versionar todavía, por lo que `git diff` no muestra su contenido; se leyeron
completos junto a pantallas, rutas, contratos y pruebas. No se reaplicó el diseño.

- `AccessSurface.tsx`: completo (assets, safe areas, teclado/scroll, theme,
  acciones, progreso/errores). Se conserva sin cambios.
- `accessModel.ts`: completo (México, OTP de seis dígitos, cooldown 60 s,
  countdown y errores en español). Se conserva sin cambios.
- `productSession.ts`: flujo existente completo; faltaba proteger respuestas
  obsoletas de refresh/validación tras logout o reemplazo de cuenta. Se reprodujo
  con transporte diferido: la prueba falló antes del fix.

Se añade una generación **local de identidad de autenticación**, no de viaje:
logout y aceptación OTP/registro invalidan trabajo anterior; la rotación normal
de tokens no cambia identidad. Se comprueba antes/después de escribir dentro
del serializador y antes de refrescar/limpiar por un 401. Refresh tardío no
recrea credenciales; 401 viejo no refresca ni borra otra cuenta. Los rechazos
401 actuales continúan cerrando la sesión como antes. No cambian endpoints,
capacidades, validadores, storage/server ni namespaces QA/producto.

Regresiones nuevas cubren refresh → logout → respuesta tardía, `/me` viejo →
OTP de otra cuenta → 401 tardío, grant OTP de registro tardío tras logout y
expiración real del refresh actual. El resto
del acceso/registro/restauración/cooldown/cuenta/logout ya implementado permanece.
Se conservan íntegros los cambios de mapas, Passenger, Driver, lifecycle y logs
QA. Esta reanudación sólo cambia el cliente de sesión, sus tests y documentación.

Validación final de reanudación: focales auth/acceso/sesión **26/26**, suite
completa **381/381**, TypeScript, lint, worklets, splash y diff-check PASS.
La comparación de hashes de src/Gateway/logs confirma únicamente productSession
modificado; AccessSurface/accessModel y los dos logs QA permanecen idénticos.
Sin nuevas dependencias, cambios nativos ni despliegue. SMS/Android físico pendientes.

Checkout real: `codex/product-phone-auth-p1-1`, HEAD
`2c9018f4b8b34453bed2296f25cb4a8cc540f757`. Esta ronda no hace commit,
push, Railway ni OTA. Conserva auth P1.1 y la corrección operativa de mapas
P1 que ya estaban pendientes localmente. Los dos logs de QA ajenos se conservan.

## Dirección visual aplicada

El tablero «Flujo de incorporación y cuenta Vima» guía composición, jerarquía y
estados, sin trasladar proporciones de sus ilustraciones a Android. Se reutilizan
Inter, Material Symbols, colores/elevaciones existentes, botones, theme global y
Motion System. `AccessFrame` usa safe areas, scroll, ancho máximo 480 dp, acciones
de al menos 44 dp y teclado Android con el resize vigente; iOS usa KeyboardAvoidingView.
Las transiciones reutilizan `ElementEntrance`/press y Reduced Motion; no hay ciclos
decorativos nuevos. El contador OTP es funcional y se detiene en background.

El arranque conserva su bootstrap real de fonts/preferencias y añade el lockup
maestro de splash al progreso recuperable existente. Acceso usa el lockup maestro
de header, sin recolorearlo ni reconstruirlo. No existe un asset propio del paisaje
del tablero; no se extrae la ilustración ni se genera otro branding/fondo. Dark
conserva la identidad original sobre una pequeña superficie clara. Las cards de
acceso/cuenta tienen sólo un wash local al 94% con level1; no se recupera Glass
global, tokens nuevos, blur nativo ni dependencias.

## Flujos reales

- Producción: `/` → `/auth` → `/passenger`; Perfil en Home abre `/account`.
  QA/DEV mantienen sus guards/rutas y LiveAccountGate; Perfil QA sigue disabled.
- Teléfono: México +52 fijo, diez dígitos nacionales, pegado E.164 mexicano
  normalizado sin truncar números extranjeros para hacerlos pasar.
- OTP: seis casillas visuales con un único input nativo accesible/autofill.
  Verificación explícita, errores recuperables, cambiar número/back y reenvío
  después de 60 s (cooldown actual del Gateway). La expiración usa `expiresIn`
  validado de la respuesta real; al volver a foreground se recalculan deadlines.
- Teléfono existente usa la sesión devuelta por verify; nuevo teléfono usa el
  registration token existente y nombre obligatorio. No se introduce otra
  validación de identidad ni se concede Driver durante registro.
- Restauración: cuenta → identidad matching → solicitud activa. Passenger
  mantiene su shell/mapa/sheet mientras una superficie de progreso cubre Home
  hasta que el bootstrap autoritativo existente termina. Se exponen únicamente
  `activeReady`/`activeError` del flow; no se añade un segundo GET de viaje ni
  se altera reconciliación, identidad, epochs, matching o lifecycle.
- Cuenta: nombre auténtico, iniciales, capacidad Passenger, theme global
  persistente, estado de Reduced Motion y logout con confirmación. No se muestra
  teléfono/foto ficticio ni se simula edición. Back vuelve al Passenger existente.
- Logout limpia exclusivamente SecureStore de producto y cache remoto; no
  cancela el viaje ni modifica credenciales QA. Si falla la red pero se borró
  la sesión local, se informa que el cierre del servidor no pudo confirmarse.
  Si falla el borrado nativo, la UI no declara éxito y permite reintentar.

## Compatibilidad de sesión y cancelación

Se preservan endpoints, capacidades Passenger estrictas, refresh y namespaces.
El cliente añade cancelación a start/verify/register/current, plazos de lectura y
request completos (incluido decode), y serialización local de aceptación/logout.
Volver atrás o desmontar no acepta respuestas tardías. Si se cancela durante una
escritura SecureStore, se restaura el registro anterior validado; un /me tardío
no recupera una identidad después de logout. Offline/timeout permiten reintentar
sin borrar credenciales válidas. No cambia Gateway ni su almacenamiento.

## Límites del contrato actual

- `/auth/me` sólo entrega `accountId`, `displayName`, `capabilities`. No entrega
  teléfono ni foto, y no existe endpoint de actualización de perfil. El nombre
  es editable durante registro, no después. No hay subida/almacenamiento de fotos.
- Producto sólo permite Passenger. Aprobación Driver y perfil vehicular siguen
  pendientes de contrato/proceso operativo; no se habilita una ruta Driver por UI.
- Cuenta no añade pagos, tarjetas, historial, soporte ni enlaces legales sin un
  destino/contrato aprobado. Favoritos/guardados existentes permanecen en Home.
- Twilio Verify debe configurarse externamente para emitir códigos de seis
  dígitos antes del QA live de esta UI; el adapter existente no se reconstruye.
  SMS real sigue sin verificar. Configuración de secrets/HTTPS/volumen en
  [gateway/README.md](../gateway/README.md); no se incluyen secretos en archivos/logs.

## Archivos de esta ronda

| Área | Archivos |
| --- | --- |
| Presentación | `src/features/auth/AccessSurface.tsx`, `ProductAuthScreen.tsx`, `ProductAccountScreen.tsx`, `accessModel.ts` |
| Sesión | `src/services/auth/productSession.ts` |
| Navegación/recuperación | `app/account.tsx`, `src/features/passenger/ProductPassengerScreen.tsx`, `PassengerScreen.tsx`, `PassengerBottomNavigation.tsx`, `usePassengerFlow.ts` |
| Arranque | `src/providers/RootProviders.tsx` |
| Regresiones | `tests/product-access-ui.test.ts`, `tests/product-session.test.ts` |
| Documentación | este documento, `PROJECT_STATE.md`, `DECISIONS.md`, `src/features/auth/README.md` |

Las rutas `/auth`/`/passenger` y cambios Gateway son de P1.1 previo, no una
reimplementación de esta ronda. Los archivos de mapas operativos conservan su
hash de inicio, excepto las dos fronteras opcionales de presentación en
PassengerScreen. Camera, route-fit, assets, telemetría y Driver no se modifican.

## Validación inicial y pendientes (2026-10-13; revalidación arriba)

- Focal acceso/sesión: 15/15 PASS. Suite completa: 371/371 PASS.
- TypeScript, lint, worklets, schema MapLibre (suite), splash e aislamiento
  fixture/server/pricing/paths/credenciales pasan. Export Hermes Android/iOS
  validado; no equivale a render nativo ni prueba SMS.
- Expo Doctor del mismo checkout: 20/21 por nueve patches SDK 57 recomendados.
  No se cambian dependencias para silenciarlo. Warnings de strip-types/module
  type y react-test-renderer son no bloqueantes.
- Sin nueva dependencia, modificación nativa ni Development Build requerido
  por esta ronda. No se publica ningún bundle ni se habilita producción live.

QA Android físico **PENDIENTE**: con variante productiva y servicio OTP habilitado
en un entorno autorizado, probar ambos themes en pantalla ~20:9, teclado abierto,
scroll/text scaling, autofill, back y 60 s de reenvío; teléfono nuevo con nombre y
teléfono existente sin registro; código erróneo/expirado, offline, timeout y retry;
cierre/reapertura con refresh y viaje activo antes de Home; entrada/salida de
Perfil sin perder el viaje; theme persistente y logout. Repetir con Reduced Motion.
Validar aparte que QA conserva LiveAccountGate y su credencial. No se declara
SMS ni QA físico aprobado hasta realizar estas pruebas.
