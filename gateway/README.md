# Gateway geoespacial y autenticación de producto Vima

## Autenticación productiva P1.1 (implementación local, aún no habilitada en Railway)

La configuración productiva es opt-in: sólo cuando `VIMA_PRODUCT_AUTH_PROVIDER=twilio`
se activan los endpoints OTP de producto y se deja de cargar `VIMA_AUTH_CONFIG_PATH`.
No configures el proveedor OTP en `VIMA_BACKEND_MODE=qa`; QA continúa usando su
`AuthConfig` externo y la app `LiveAccountGate`. Las sesiones son autoridades distintas.

Preparación Passenger y propuesta administrativa Driver (no implementada) en
[PRODUCT_ACCESS_ROLLOUT.md](../docs/PRODUCT_ACCESS_ROLLOUT.md). Producto requiere un
servicio/volumen separado del QA operativo; no se agrega una autoridad QA de fallback.
El modo no-QA se llama `local` en la configuración actual, incluso detrás de Railway.

Requiere servidor Node >=22.13, un volumen persistente (`VIMA_GEO_RUNTIME_DIR`, por
ejemplo `/data`) y estas variables externas:

| Variable | Uso |
| --- | --- |
| `VIMA_PRODUCT_AUTH_PROVIDER=twilio` | Habilita auth de producto fuera de QA. |
| `VIMA_PRODUCT_AUTH_SECRET` | Secreto aleatorio de al menos 32 caracteres para derivar hashes HMAC. |
| `TWILIO_ACCOUNT_SID` | Identidad de servidor Twilio. |
| `TWILIO_VERIFY_SERVICE_SID` | Verify Service para SMS. |
| `TWILIO_AUTH_TOKEN` | Credencial privada Twilio. |

El gateway persiste `auth-v1.json` en el runtime dir mediante escrituras serializadas
y reemplazo atómico. Restringe acceso al volumen. Se almacenan HMAC de teléfonos y
hashes de access/refresh tokens, nunca teléfono ni tokens en claro. OTP se limita a
teléfonos mexicanos, una solicitud por minuto y cinco por teléfono en una hora; cada
challenge expira en diez minutos y permite cinco verificaciones. La app necesita
`EXPO_PUBLIC_VIMA_API_BASE_URL` HTTPS. No incluyas ninguna variable secreta en EAS,
`EXPO_PUBLIC_*`, el bundle ni los logs.

Rutas exactas: `POST /v1/auth/otp/start`, `POST /v1/auth/otp/verify`,
`POST /v1/auth/register`, `POST /v1/auth/refresh`, `POST /v1/auth/logout` y
`GET /v1/auth/me`. Sólo start/verify/register/refresh son públicas; logout y me
requieren access token. No existe un bypass público por prefijo `/v1/auth/`.
Las nuevas cuentas sólo tienen capacidad Passenger. No se ha creado aprobación
Driver ni perfil vehicular. Para más detalle, ver [decisiones](../docs/DECISIONS.md)
y [estado](../docs/PROJECT_STATE.md).

El adapter está probado con OTP simulado. No se han configurado credenciales,
enviado SMS real, desplegado Railway ni publicado OTA; la autenticación productiva
no debe anunciarse como live hasta completar esas comprobaciones.

Twilio API: [Verify Verification](https://www.twilio.com/docs/verify/api/verification)
y [Verification Check](https://www.twilio.com/docs/verify/api/verification-check).

## Gateway geoespacial Vima P0

Node >=22.13 y TypeScript con el toolchain existente, sin framework ni base de datos adicional.
Incluye AuthConfig, matching y lifecycle con almacenamiento durable. Admite validación local,
QA interno persistente y la nueva autenticación OTP de producto, pendiente de configuración live.

## Ejecutar

Desde la raíz del repo, `npm ci` si faltan dependencias. El proceso servidor debe recibir
`TOMTOM_API_KEY` desde tu entorno/gestor externo. No la pongas en `.env` de Expo, app.config,
EXPO_PUBLIC, logs ni argumentos de comandos. El único ejemplo servidor es `.env.example` vacío.
Alternativamente Node admite `--env-file` con un archivo privado externo elegido por el usuario;
no hay ninguna ruta personal precargada o persistida por el repo.

```powershell
# Terminal servidor, con TOMTOM_API_KEY ya inyectada en este proceso
$env:VIMA_GEO_HOST='0.0.0.0'
npm run geo:gateway
```

Por defecto escucha sólo en loopback, puerto 8787. `VIMA_GEO_HOST` permite interfaz LAN;
`VIMA_GEO_PORT` cambia el puerto. Usa la red privada y permite ese puerto en el firewall del equipo
si es necesario. `GET /health` devuelve `status` y `configured` (presencia de key, no validez).

En **otro proceso**, sin la credencial servidor, configura tu dirección LAN real externamente:

```powershell
$env:EXPO_PUBLIC_VIMA_API_BASE_URL='http://<IP-LAN-DEL-EQUIPO>:8787'
$env:EXPO_PUBLIC_VIMA_FIXTURES=''
npm start -- --clear
```

Abre `/dev/passenger` en el Development Build de Android en la misma red. HTTP privado sólo
se acepta con `__DEV__`; release exige HTTPS y nunca envía credenciales Vima sobre HTTP.
El cliente no tiene localhost/IP/URL productiva fija. El Development Client debe permitir
tráfico HTTP de depuración; si el APK existente no lo permite, usa HTTPS accesible o recompila
su variante development, sin abrir cleartext en release.

`EXPO_PUBLIC_VIMA_FIXTURES=1` activa deliberadamente fixtures DEV. Vacío usa live si hay URL;
sin ambas configuraciones se muestra error de configuración. No hay fallback ante fallo live.
Precio y pago quedan sin valor y la solicitud deshabilitada porque geoespacialidad no cotiza
ni asigna viajes. No se inventan recientes personales. Los estados completos se prueban con fixtures.

## Validar

```powershell
npm run test:gateway
npm run geo:smoke
```

Smoke usa la key del proceso y arranca/cierra su propia instancia local efímera. Sin key devuelve
SKIP explícito y salida 0. Con key imprime PASS/FAIL, categoría de error y trazas
estructurales del caso UAEM; devuelve salida 1 ante fallo.
Plaza y Terminal validan Discover → Details; CU UAEM valida Suggest → Details sin Discover
intermedio. Una prueba separada comprueba Discover sin coincidencias. Cada FAIL indica la etapa (`autocomplete`, `search`, `provider match`,
`resolve/details` o `final normalization`). El caso UAEM añade trazas estructurales acotadas:
tipo, presencia de ID/título/posición/dirección y enlace de Details. No imprime IDs del
proveedor, coordenadas, direcciones, query privada, cabeceras ni respuesta raw.
Suggest/Discover solicitan `more` para validar el seguimiento Details. Un `discoverAction`
seleccionado sigue Discover con filtros acotados y el mismo Session-Id; nunca se envía la URL
ni el requestBody TomTom al móvil. Búsqueda enviada explícitamente usa Discover. Una respuesta
vacía válida se normaliza a `[]`; un esquema inválido conserva `invalid_result`.
La key necesita acceso real a los cuatro servicios Orbis/versiones documentados. Unit tests usan
fetch simulado y una credencial aleatoria efímera; nunca dependen de Internet ni de una key real.

Node 24 puede emitir `MODULE_TYPELESS_PACKAGE_JSON` cuando `--experimental-strip-types` importa
archivos TS de `src/` o `tests/` bajo la raíz sin `type` declarado. Es una advertencia de
inferencia del formato ESM, no un fallo del adapter ni del smoke. `gateway/package.json` ya fija
el tipo sólo para el gateway; no se cambia el tipo global porque Expo/Metro/Babel y scripts
existentes comparten la raíz.

## Límites operacionales DEV

Centralizados en `config.ts`, no decisiones finales de producto:

| Variable | Default |
| --- | --- |
| VIMA_GEO_SESSION_TTL_MS | 300000 |
| VIMA_GEO_CLEANUP_MS | 30000 |
| VIMA_GEO_UPSTREAM_TIMEOUT_MS | 10000 |
| VIMA_GEO_RATE_WINDOW_MS | 60000 |
| VIMA_GEO_RATE_LIMIT | 60 por dirección de conexión |
| VIMA_GEO_LOGGING | 1; usar 0 para desactivar logs de requests |

Límites adicionales en el mismo módulo: cuerpo 16KiB, query 256 caracteres, 10 paradas,
500 sesiones, 1000 contadores de clientes, 10 resultados, respuesta upstream 4MB. No se confía
en X-Forwarded-For. Sin proxy arbitrario, CORS web, reintentos ocultos o persistencia de historial.
Las sesiones sólo retienen handles/datos locales seleccionables acotados; TTL y reinicio los eliminan.
Logs JSON contienen endpoint normalizado, requestId, duración, upstreamStatus, count y categoría;
no incluyen query, dirección, coordenadas, raw body ni key. Errores HTTP también se sanitizan.

`server.ts`: HTTP/validación/lifecycle; `state.ts`: TTL/rate; `tomtom.ts`: origen upstream fijo,
headers/timeout/normalización; `places.ts`: catálogo local; `groundTruth.ts` + `smoke.ts`: prueba live.
Contratos públicos permanecen en `src/services/geospatial/` y no importan el servidor.

Basemap sigue independiente mediante `EXPO_PUBLIC_MAP_STYLE_URL`. No reutilices la key servidor
para tiles cliente. Orbis visual/política de credencial cliente sigue pendiente, sin proxy improvisado.
Ver [contrato](../docs/TOMTOM_GEOSPATIAL.md) y [ground truth](../docs/ATLACOMULCO_GROUND_TRUTH.md).

## QA persistente

El gateway actual incorpora AuthConfig, matching y lifecycle. El modo local permanece compatible.
Para QA Railway ver [guía QA release](../docs/QA_RELEASE.md): `PORT` tiene prioridad sobre
`VIMA_GEO_PORT`; `VIMA_BACKEND_MODE=qa` exige Bearer y HTTPS en todo `/v1/**`.
`/health` es liveness; `/ready` verifica configuración y recuperación durable, sin llamadas TomTom.
