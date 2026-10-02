# Gateway geoespacial Vima P0

Node >=22.13 y TypeScript con el toolchain existente; sin framework, base de datos, auth,
matching ni pagos. Es un servidor local de validación P0, **no un backend productivo**.

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
