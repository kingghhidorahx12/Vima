# Acceso Passenger de producto y bloqueos de integración — 2026-10-14

**Estado posterior de despliegue:** checkpoint `d7356734` publicado; Gateway
product-preview HTTPS operativo, `/ready` 200 y persistencia comprobada tras
reinicio. Verify Service de seis dígitos y OTP real verificados; teléfono nuevo
retorna `registration_required`. APK interno product-preview generado (FINISHED)
(`930e649e-6cfc-45bb-9488-af26ed35ed13`), con descarga en PROJECT_STATE.
QA no modificado, sin OTA ni Driver
productivo. Ver el estado actualizado en [PROJECT_STATE.md](PROJECT_STATE.md).
La descripción de la ronda local a continuación se conserva como historial.

Implementación local sobre `codex/product-phone-auth-p1-1`, HEAD
`2c9018f4b8b34453bed2296f25cb4a8cc540f757`. El SHA no incluye todavía auth P1.1,
mapas operativos ni acceso/cuenta P1. Se conservan esos pendientes y ambos logs QA.
Sin commit, push, Railway, EAS Build ni OTA en esta ronda.

## Correcciones implementadas

- `ApiRequest.timeoutMs` transporta el presupuesto de la operación. Matching pasa
  12 s para operaciones normales y 30 s para `/changes`; el transporte de producto
  respeta ese presupuesto, incluyendo decode. Geospatial conserva su presupuesto
  vigente. Gateway sigue manteniendo un long-poll inactivo durante 25 s. No cambia
  su generación de rutas, matching, lifecycle ni persistencia.
- `ProductAuthClientError` conserva status/code y pertenece a la familia `ApiError`.
  Un 401 definitivo no se interpreta como pérdida de internet. Refresh continúa
  single-flight y se reintenta la operación sólo una vez; otro 401 invalida sesión.
  El poll termina por autenticación en lugar de reintentarlo como offline.
- La sesión publica un snapshot no sensible (generación, estado, motivo).
  Passenger elimina el subárbol protegido al invalidarse auth, cancela/limpia el
  QueryClient y vuelve a OTP con aviso de sesión expirada. Logout elimina el acceso
  durante su cierre; no cancela el viaje. Un fallo transitorio de red conserva la
  sesión y permite reconexión. Rotar tokens no remonta mapa/sheet ni cambia identidad.
- Respuestas exitosas antiguas también se rechazan tras cambiar identidad. Durante
  logout no se acepta simultáneamente una cuenta nueva que el cleanup viejo pudiera
  borrar. Se conservan namespaces independientes QA/producto.
- SecureStore: lectura y operaciones serializadas tienen plazo de 8 s. Vencer el
  plazo libera la UI, pero **no libera la cola nativa**. Se invalida acceso y se
  bloquea aceptación de otra sesión hasta que la operación real y su cleanup
  terminen. Una escritura tardía tras logout/revocación/plazo se elimina; nunca
  restaura las credenciales anteriores. Back sólo restaura el registro anterior
  si sigue perteneciendo a la misma generación válida. Retry no salta la cola.
  Un borrado fallido se vuelve a intentar antes de aceptar otra cuenta.

Límite nativo real: JavaScript no puede cancelar SecureStore ni asegurar un borrado
si el SO termina el proceso antes de confirmar la operación. No se declara logout
completo cuando el borrado falla. Reabrir exige `/me`/refresh válidos antes de Home;
una sesión revocada en servidor nunca es adoptada a partir del archivo local.

## Una autoridad por bundle y por servicio

Producción entra a `/auth` → `/passenger` → `/account`, sin tokens QA ni selector.
`EXPO_PUBLIC_VIMA_AUTH_MODE=product` permite el mismo acceso en un APK interno o DEV.
Es configuración del bundle, no una preferencia modificable por el usuario:

- Deshabilita `/qa/passenger`, `/qa/driver`, `/qa/account`, `/dev/passenger` y
  `/dev/driver` en ese bundle. No hay fallback a LiveAccountGate.
- Sin ese modo, la variante QA conserva sus herramientas/token y su Driver actual.
- Producción no puede declarar modo `qa`; producto tampoco puede activar fixtures.
- La URL de API debe apuntar al servicio de producto, nunca a un Gateway en modo QA.
  El servidor de producto ya rechaza tokens QA; el de QA no habilita OTP.
- La credencial QA previa permanece guardada e intacta, pero no se usa en producto.

Compatibilidad necesaria de media: `PlaceThumbnail` selecciona sólo la autoridad
del bundle. En producto usa headers de la sesión productiva exclusivamente para
`/v1/media/place-images/` del mismo origen HTTPS; nunca lee el token QA ni lo envía
a otra URL. Logout elimina la imagen autenticada y se evita caché de disco de media
protegida. Media aprobada/resolver, geometría y fallback semántico no cambian.

`eas.json` añade `product-preview`: hereda production, distribución interna APK,
variante production, modo product y canal **product-access-preview**. Mantiene el
identificador Vima base; no altera el APK/canal QA ni el canal production. El perfil
es sólo preparación local. No publicar producto en el canal QA compartido: quitaría
el acceso Driver de los testers que reciban ese bundle.

## Railway: configuración necesaria, no aplicada

Provisionar un servicio/volumen de producto separado del QA existente. No reutilizar
un snapshot con propietarios QA ni migrar viajes/identidades implícitamente.

| Variable servidor | Configuración |
| --- | --- |
| `VIMA_BACKEND_MODE` | `local` o ausente; **no `qa`**. `local` es el nombre vigente del modo no-QA, también detrás de Railway HTTPS. |
| `VIMA_PRODUCT_AUTH_PROVIDER` | `twilio` |
| `VIMA_PRODUCT_AUTH_SECRET` | Secreto aleatorio estable de 32+ caracteres, sólo servidor; cambiarlo afecta los HMAC de teléfonos existentes. |
| `TWILIO_ACCOUNT_SID` | Cuenta Twilio externa. |
| `TWILIO_VERIFY_SERVICE_SID` | Verify Service externo. |
| `TWILIO_AUTH_TOKEN` | Secreto Twilio externo. |
| `VIMA_GEO_RUNTIME_DIR` | Directorio absoluto en volumen durable dedicado, p. ej. `/data/product`. |
| `TOMTOM_API_KEY` | Key servidor ya aprobada, fuera de Git/EAS público. |
| `VIMA_PRICING_CONFIG_PATH` | Configuración aprobada externa, fuera de Git. |
| `VIMA_PLACE_MEDIA_DIR` | Media aprobada externa, si se habilita. |

No configurar `VIMA_AUTH_CONFIG_PATH` como puente a Driver QA. Producto no la carga.
Una réplica; comando vigente `node --experimental-strip-types gateway/main.ts`;
Railway proporciona PORT; HTTPS público y `/ready`. Respaldar y proteger volumen:
`auth-v1.json`, matching y demás persistencias. No imprimir secretos ni cuerpos OTP.

Configurar Verify Service con `CodeLength=6`, que corresponde al input aprobado.
La longitud se configura en el servicio ([Twilio Service API](https://www.twilio.com/docs/verify/api/service)).
Comprobar entrega mexicana y límites de la cuenta mediante una prueba SMS autorizada.
Los tests usan proveedor simulado; no constituyen SMS real.

Variables públicas del bundle: `EXPO_PUBLIC_VIMA_VARIANT=production`,
`EXPO_PUBLIC_VIMA_AUTH_MODE=product`, `EXPO_PUBLIC_VIMA_API_BASE_URL` HTTPS del servicio
de producto, `EXPO_PUBLIC_MAP_STYLE_URL` aprobado y `EXPO_PUBLIC_TOMTOM_DISPLAY_KEY`
cliente restringida. Sin fixtures ni claves servidor. El perfil product-preview
usa environment production por herencia; build/update deben usar las mismas variables
([Expo EAS environments](https://docs.expo.dev/eas/environment-variables/)).

## Ver el login en Android sin USB ni Metro (pasos futuros)

1. Tras autorización, configurar y desplegar primero el servicio de producto y
   Verify; no cambiar el servicio QA operativo. Validar `/ready` y SMS real.
2. Con variables EAS production aprobadas, generar el APK interno mediante
   `eas build --platform android --profile product-preview`. Descargarlo e instalarlo
   desde el teléfono. Es Vima, separado de Vima QA; un Development Client no sirve
   para este recorrido sin Metro.
3. Abrir Vima: debe mostrar teléfono/OTP. Número nuevo → código → nombre; existente
   → código → Passenger. Confirmar persistencia, Perfil, themes, logout y errores.
4. Para cambios JS posteriores, autorizar una OTA dirigida exclusivamente a ese
   canal/runtime compatible, con environment production. No usar el canal QA
   compartido ni afirmar que un APK anterior ya contiene este working tree.

El fix es JS, sin dependencias ni cambios de código nativo. El primer APK de un
canal/variante que aún no esté instalado requiere entrega de APK; no requiere un
nuevo Development Build para corregir los bugs. Aquí no se construyó ni publicó nada.

## Primera cuenta Driver de producto — PROPUESTA, NO IMPLEMENTADA

**Actualización D1 (2026-10-15):** la propuesta histórica debajo ya tiene autoridad,
migración y administración privada implementadas localmente, según
[DRIVER_AUTHORITY_D1.md](DRIVER_AUTHORITY_D1.md). No está desplegada ni se aprobó
una cuenta real. Bootstrap/navegación Driver de producto y QA entre teléfonos son
dependencias de D2. El diagnóstico siguiente describe el estado anterior a D1.

Hoy no existe un comando administrativo suficiente. Editar `auth-v1.json` para añadir
Driver falla su validador: `User.capabilities` sólo permite Passenger; authenticate
emite principal Passenger; `profile()` rechaza Driver; `drivers` está vacío. Tampoco
existe entrada Driver de producto en la app. Una flag de UI no resolvería esto.

Propuesta mínima a revisar antes de implementar:

1. La persona verifica su teléfono y crea su cuenta Passenger por el OTP existente.
2. Un operador autorizado verifica identidad y vehículo fuera de una UI pública.
   Un comando administrativo privado, auditable y validado recibe accountId y perfil
   real, registra aprobación/capacidad Driver y perfil completo en persistencia
   versionada/atómica. No manipulación JSON manual, tokens QA ni alta pública Driver.
3. Extender la **misma** autoridad de producto para comprobar capacidades efectivas
   en servidor y emitir el rol operativo elegido sólo si está aprobado. El contexto
   de rol que solicite la app nunca basta para conceder permisos. Nuevos registros
   permanecen Passenger; las rutas Driver, discovery y privacidad conservan fences.
4. El coordinador obtiene exclusivamente Drivers aprobados con perfil válido de ese
   registro. La app incorpora bootstrap Driver productivo sobre el flujo existente.
   Logout/revocación/cambio de rol no pueden mezclar identidades o sesiones.
5. Validar Passenger↔Driver de producto con dos teléfonos, PIN, viaje, recuperación,
   settlement y revocación. Recién entonces es posible QA OTP → asignación completa.

Dependencias/implicaciones pendientes de aprobación:

- Migración compatible de auth/capacidades y registro de perfiles; política de
  selección de rol y revocación mientras existe viaje activo. No borrar snapshots.
- Contrato actual de perfil: nombre de conductor, rating numérico, nombre de vehículo,
  placa y color. Definir honestamente un Driver nuevo sin calificaciones; no fabricar
  cinco estrellas ni copiar datos QA como si fueran datos reales.
- Herramienta administrativa con control de acceso, auditoría y respaldo; rutas y
  decoders de cliente que acepten sólo capacidades autorizadas.
- Despliegue backend posterior separado y explícito. Mientras falte, producto puede
  autenticar Passenger, pero no disponer de Driver asignable; no simular una oferta.

## Validación y QA pendiente

`tests/product-integration.test.ts` cubre Gateway con espera real de 25 s, presupuesto
de matching y abort, refresh concurrente, offline/reconexión, 401 definitivo/segundo
401, invalidación de Passenger montado, writes/deletes nativos pendientes, cuenta A→B,
logout concurrente y aislamiento de rutas/modos. Regresiones previas permanecen.

Resultado final: integración **12/12**, focal integración/media **17/17**, suite
**393/393**, TypeScript/lint, worklets, MapLibre/schema (suite), splash y fixture
isolation PASS. Export Hermes Android/iOS e aislamiento server/pricing/paths PASS;
se comprueba además sesión de producto incluida y gate/namespace QA excluidos en
ambos bundles. Export offline con URLs sintéticas, sin dotenv; no es un build/OTA.
Expo Doctor no se reejecutó: no cambian dependencias; el 20/21 previo es histórico.

Android/SMS reales PENDIENTES: primer arranque sin reinicio, teclado/OTP/reenvío,
sesión vencida con app abierta, cuenta/logout, temas y Reduced Motion; restauración
antes de Home, mapas/sedán/Driver QA y modo avión + reapertura sin perder viaje.
OTP → viaje asignado productivo está pendiente de la habilitación Driver propuesta.
