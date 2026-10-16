# D1 — Autoridad productiva Passenger/Driver

Implementación local del 2026-10-15, sobre `55e004e`, en
`codex/product-phone-auth-p1-1`. No desplegada. No se habilitó ninguna cuenta real.
El cierre Android D0 corresponde a otra entrega y no verifica D1.

## Identidad, contexto y autorización

- Una cuenta OTP conserva su accountId y sus sesiones. Registro nuevo sólo Passenger.
- `auth-v1.json` conserva el nombre de archivo y migra su schema `version: 1 → 2`.
  `users[].capabilities` mantiene la base Passenger compatible; `users[].driver`
  contiene autorización actual y perfil histórico. `/me`, verify y refresh derivan
  las capacidades efectivas desde ese registro; no se confía en capacidades cacheadas.
- Contexto HTTP: `X-Vima-Operational-Context: passenger|driver`. Ausente significa
  Passenger en producto; QA conserva su principal estático y no gana permisos con
  una cabecera. Rutas Passenger/Driver comprueban el contexto y el coordinador
  comprueba de nuevo la autorización vigente dentro de su sección serializada.
- `AuthConfig.hasIdentity` permite reconstruir propietarios, ofertas, assignments y
  receipts históricos. `eligibleDriver` permite exclusivamente nuevos trabajos de
  un Driver aprobado y no bloqueado. Tener identidad histórica no concede elegibilidad.
- No se permite asignar al mismo accountId su propia solicitud Passenger.
- El cliente transporta el contexto explícito (`createMatchingClient({ context })`)
  y admite capacidades reales. D1 no habilita todavía navegación/bootstrap Driver
  de producto; esa integración pertenece a D2. No se reutiliza LiveAccountGate.

## Operaciones y suspensión

| Estado administrativo | Nuevas ofertas / disponibilidad / aceptar / cancelar asignación | Viaje ya asignado | Tras terminal |
| --- | --- | --- | --- |
| approved, sin bloqueo | Permitido con las reglas existentes | Lifecycle existente | Reglas normales |
| suspended / revoked | 403; oferta pendiente retirada; Driver no asignado queda PAUSED | Sólo consulta, ubicación/telemetría y lifecycle existente para finalizar y resolver efectivo | Driver state/operaciones nuevas: 403; replay exacto de receipts lifecycle ya confirmados permitido |
| security block | 403 | También 403; bloqueo de seguridad separado | También bloqueado |

La restricción de nuevas tareas es inmediata al commit administrativo. Revocar
durante un viaje retira la capacidad general pero deja una excepción limitada a
su asignación existente hasta CANCELLED/COMPLETED, incluido PAYMENT_PENDING.
No se cambia PIN, validación de telemetry, settlement ni precios. Al liberar el
viaje el Driver restringido queda PAUSED y no entra en otro matching.
`security_unblock` no aprueba de nuevo a un Driver suspendido/revocado;
`approve` tampoco elimina un bloqueo de seguridad.

Un bloqueo de seguridad no liquida/cancela automáticamente un viaje: la respuesta
operativa a esa emergencia sigue fuera de D1. No usarlo como suspensión normal.

El perfil vehicular D1 exige todos los campos del contrato vigente: nombre/modelo
descriptivo, placa y color no vacíos. El nombre del conductor procede de su cuenta.
El alta crea `rating: null, ratingCount: 0`; Passenger muestra «Sin valoraciones».
Decoders admiten rating ausente/null y ratings numéricos históricos, incluido QA.
No hay sistema nuevo de calificaciones. El perfil permanece inmutable en D1:
reaprobar con otro vehículo devuelve 409; versionar edición de perfiles es posterior.

## Administración privada en el Gateway activo

`gateway/main.ts` abre un listener separado sólo en `127.0.0.1`, únicamente en
producto con `VIMA_DRIVER_ADMIN_SECRET` configurado. Puerto por defecto 8790,
override `VIMA_DRIVER_ADMIN_PORT`, distinto del puerto público. No configurar un
proxy/dominio para ese puerto. No existe una ruta de concesión en el router público.

La credencial es independiente de OTP y QA (32–256 caracteres sin espacios),
comparada en tiempo constante. El listener limita body a 8 KiB. La operación se
ejecuta en el coordinador del proceso activo; el CLI no abre ni edita el storage.

Acciones: `approve`, `suspend`, `revoke`, `security_block`, `security_unblock`.
Input exacto: `operationId`, `accountId`, `action`, `reason`; además `vehicle`
sólo para approve. operationId debe ser único por decisión. Mismo ID y payload
canónico devuelve el mismo recibo; payload distinto con el mismo ID devuelve 409.
Un error de red del CLI requiere reintentar **el mismo** operationId/payload.

Ejemplo estructural, no una aprobación para ejecutar en esta ronda:

```json
{
  "operationId": "decision-operativa-unica",
  "accountId": "UUID-DE-CUENTA-OTP-EXISTENTE",
  "action": "approve",
  "reason": "Referencia de verificación administrativa",
  "vehicle": { "name": "Modelo real", "plate": "PLACA-REAL", "color": "Color real" }
}
```

Railway permite ejecutar comandos en el contenedor activo mediante
[railway ssh](https://docs.railway.com/cli/ssh), con acceso SSH del operador.
Para una futura ejecución autorizada: seleccionar explícitamente proyecto product-preview,
entorno y servicio; abrir SSH, situarse en el directorio de la aplicación y ejecutar
`node scripts/driver-admin.cjs`, enviar el JSON por stdin y terminar stdin.
La clave se lee del environment privado del contenedor, no de argumentos ni del JSON.
También puede canalizarse un archivo JSON privado por stdin a ese comando remoto.
No usar `railway run`: ejecuta localmente, no contra el coordinador activo.
No se ha ejecutado SSH ni cambiado configuración Railway durante D1.

El recibo durable incluye accountId, operationId, acción, motivo, fecha servidor,
actor lógico `gateway-operator`, fingerprint HMAC del payload y resultado.
La identidad humana depende del control de acceso SSH y del secreto operativo;
D1 no crea un directorio de administradores. No contiene teléfono, OTP ni tokens.
La auditoría no se poda silenciosamente: al alcanzar 100 000 decisiones rechaza
otras con 503, manteniendo lo persistido.

## Persistencia, migración y carreras

1. Validar el archivo existente completo. Schema desconocido, claves extra,
   referencias inválidas, sesiones duplicadas, permisos/auditoría incoherentes o
   fingerprints inválidos fallan cerrado. No se reemplaza corrupción por un store vacío.
2. Antes de migrar v1, escribir respaldo exclusivo `auth-v1.before-v2.<uuid>.json`
   con su contenido, fsync y permisos restringidos. No sobrescribir respaldos.
3. Guardar v2 mediante archivo temporal exclusivo, fsync y rename; en Linux también
   fsync del directorio. Publicar estado en memoria sólo después de persistir.
   No rotar tokens, recrear cuentas ni copiar identidades QA durante la migración.
4. Auth conserva su cola serializada para OTP/refresh/logout/admin. Administración
   adquiere además la misma cola de commit de matching que aceptar/ofertar.
   Se persiste primero autorización y luego se retiran ofertas. Una ETA en vuelo
   vuelve a comprobar elegibilidad al commit. La aceptación que gana primero
   deja un viaje terminable; si gana la suspensión/revocación, aceptar devuelve 403.
5. Un fallo de escritura invalida readiness y no concede estado en memoria. Si el
   proceso cae entre los dos archivos, el arranque reconcilia la autoridad durable
   antes de emitir ofertas. El snapshot no restaura un permiso revocado.

Se conserva la arquitectura aprobada **single-process/single-writer**. Requiere una
réplica, volumen durable y ningún Gateway concurrente escribiendo ese volumen,
incluidos despliegues superpuestos. No es una solución multiinstancia ni un lock
distribuido. Antes de D2/despliegue se debe comprobar esa condición operativa.
Los temporales de una escritura fallida no se adoptan automáticamente.

## Rollback

Antes de cualquier perfil/decisión Driver, el operador puede ejecutar en el
contenedor `node scripts/driver-admin.cjs rollback-passenger-auth` con `{}` por
stdin. El Gateway serializa, archiva el **estado actual** con actor/fecha en
`auth-rollback.<uuid>.json` y escribe schema v1 conservando sesiones, rotaciones y
revocaciones actuales. Entra en mantenimiento (`/ready` 503, auth/matching bloqueados)
hasta reiniciar con el binario elegido. Reiniciar D1 vuelve a migrar v1 a v2.

Con historia Driver, esa operación devuelve 409 sin tocar el archivo: no se puede
revertir al lector Passenger-only sin perder identidad/historial o revivir permisos.
El rollback de aplicación entonces exige un binario compatible con schema v2 y
esta autorización. No restaurar el backup inicial como rollback operativo: podría
resucitar sesiones ya revocadas. Los backups son recuperación forense, con el
servicio detenido y revisión de revocaciones, nunca edición manual de permisos.

## D2 / QA pendiente

- Desplegar sólo bajo nueva autorización, verificar backup/migración en Linux,
  `/ready`, persistencia, listener loopback, SSH y una sola réplica/escritor.
  Conservar `VIMA_PRODUCT_AUTH_SECRET`: cambiarlo sin una migración invalidaría
  referencias HMAC de teléfonos y fingerprints administrativos.
- Revisar operativamente identidad/vehículo y aprobar por cuenta/decisión explícita;
  ninguna cuenta real fue aprobada aquí.
- Incorporar bootstrap y selección de contexto Passenger/Driver usando la misma
  sesión, resolver el viaje activo antes de operar y manejar 403/revocación sin
  mezclar caches, identidades ni autoridades. No confiar en capacidades locales.
- Antes de conceder Driver o asignar viajes, ambos teléfonos deben ejecutar un
  cliente compatible con capacidades dobles y rating null. La OTA Passenger
  anterior a D1 sólo decodifica Passenger/rating numérico; no habilitar Driver
  real sobre esa combinación. El orden futuro es Gateway compatible, clientes
  compatibles y bootstrap D2, y finalmente aprobación explícita de la cuenta.
- Verificar dos Android: concesión con sesión previa, suspensión con oferta,
  aceptación concurrente, viaje activo/PIN/efectivo, cierre, offline/reinicio,
  revocación y restauración histórica. QA físico D1 sigue PENDIENTE; iOS pausado.
- No se requieren dependencias ni cambios nativos. D1 no modifica mapa, cámara,
  heading, Motion, rutas ni tarifas. No se publicó Railway/OTA/APK.

## Archivos de implementación

- Autoridad/storage: `gateway/productAuth.ts`, `driverAuthority.ts`, `durableJson.ts`.
- Administración: `gateway/driverAdmin.ts`, `gateway/main.ts`, `gateway/server.ts`,
  `scripts/driver-admin.cjs`.
- Matching: `gateway/matching/auth.ts`, `coordinator.ts`, `http.ts`, `trace.ts`.
- Compatibilidad cliente: `src/services/api/client.ts`,
  `src/services/auth/productCapabilities.ts`, `productSession.ts`,
  `src/services/matching/client.ts`, `decode.ts`, `driverRating.ts`,
  `src/features/passenger/model.ts`, `PassengerScreen.tsx` (sólo rating).
- Regresiones: `tests/driver-authority.test.ts`, `product-auth.test.ts`,
  `product-session.test.ts`, `matching-client.test.ts`, `passenger-visual-p1.test.ts`.
- Documentación: este documento, `PROJECT_STATE.md`, `DECISIONS.md`,
  `PRODUCT_ACCESS_ROLLOUT.md` y `gateway/README.md`.

## Validación ejecutada

- Suite completa `npm test`: **439/439 PASS**, incluyendo regresiones anteriores.
- `tests/driver-authority.test.ts`: **13/13 PASS** (incluidos en la suite completa).
- `npm run test:gateway`: **90/90 PASS**, matching, lifecycle y pricing existentes.
- TypeScript, lint, worklets, fixture isolation, splash y `git diff --check`: PASS.
- D0 comparado con el bloque original de `eb98999`: íntegro. Hashes de los dos
  logs QA sin cambios; ambos siguen untracked y fuera del staging.

Son pruebas locales con OTP/ETA simulados y HTTP en localhost. No hubo llamadas
Twilio, operación administrativa Railway ni QA físico nuevo; no equivalen a ese PASS.
