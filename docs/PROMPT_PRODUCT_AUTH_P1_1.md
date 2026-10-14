# Prompt definitivo de Codex — Vima P1.1 autenticación productiva

Trabaja sobre el repositorio local Vima. La auditoría técnica de partida fue la
rama `codex/approved-vehicle-sprite-p0` en
`2c9018f4b8b34453bed2296f25cb4a8cc540f757`; antes de editar inspecciona el HEAD
real, `git status`, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`, la auditoría
existente y los cambios recientes. Conserva todo trabajo ajeno y no reinicies ni
reescribas ramas compartidas.

## Objetivo

Implementar autenticación productiva de extremo a extremo para Passenger,
reutilizando el flujo existente. No rehagas matching, lifecycle, pricing ni mapa.
Si la base ya contiene alguna pieza, audítala y corrige sólo incompatibilidades
reales; no dupliques funcionalidades.

## Decisiones cerradas

- OTP passwordless para números telefónicos mexicanos mediante Twilio Verify SMS.
- Teléfono existente: verificar OTP e iniciar sesión. Teléfono nuevo: verificar,
  capturar nombre obligatorio y crear cuenta.
- No hay foto ni carga de imágenes.
- Las cuentas nuevas tienen sólo capacidad Passenger. Driver requiere aprobación
  operativa y perfil vehicular completo; no inventes ese proceso.
- Producto y QA tienen credenciales y sesiones separadas. Conserva
  `createAuthConfig`, `VIMA_AUTH_CONFIG_PATH`, `LiveAccountGate` y el flujo QA.
- Persistencia productiva en `auth-v1.json`, versión validada, escrituras
  serializadas y reemplazo atómico. No guardar teléfonos ni tokens en claro.
- Endpoints exactos:
  - `POST /v1/auth/otp/start`
  - `POST /v1/auth/otp/verify`
  - `POST /v1/auth/register`
  - `POST /v1/auth/refresh`
  - `POST /v1/auth/logout`
  - `GET /v1/auth/me`
- Sólo los endpoints públicos expresamente acordados pueden omitirse de la
  autenticación. No hagas bypass por prefijo `/v1/auth/`. `/me` y logout requieren
  sesión válida; matching y Driver conservan autorización por capacidad.
- Agrega límites contra abuso OTP, expiración y revocación de sesiones, rotación
  de refresh, validación de capacidades en servidor y regresiones de autorización.
- Agrega bootstrap productivo y navegación de acceso. Reutiliza Passenger existente,
  incluido el bootstrap/recovery autoritativo de solicitud activa.
- Mantén matching, lifecycle, settlement, pricing, mapas, auth QA y contratos sin
  cambios salvo compatibilidad estrictamente necesaria, documentada y testeada.

## Implementación

1. Contrasta el adapter con documentación oficial vigente de Twilio Verify para
   inicio y verificación; usa HTTPS y variables de servidor. Nunca expongas,
   persistas en el repo o registres credenciales en logs.
2. Separa autoridad OTP productiva de QA. En despliegue QA conserva la protección
   existente; no vuelvas pública toda la familia `/v1/` ni uses el token QA como
   sesión de producto.
3. Valida y normaliza el teléfono mexicano. Responde genéricamente al inicio para
   no revelar existencia de cuenta. Limita reenvíos, vida del challenge e intentos.
4. En `auth-v1.json` conserva sólo HMAC/derivados, IDs, capacidades, timestamps,
   hashes de sesiones y datos mínimos del usuario. Valida schema al cargar, serializa
   toda mutación y usa temp file + rename atómico.
5. El móvil guarda la sesión productiva en un namespace SecureStore diferente de
   QA, rota refresh al expirar access, valida `/me` al bootstrap y conserva sesión
   refrescable al reabrir.
6. `/` abre el acceso productivo sólo en producción; QA/DEV mantienen sus rutas.
   Tras autenticación, monta Passenger real con la identidad servidor y recupera
   la solicitud activa existente. No uses fixtures ni ubicación/trips inventados.

## Pruebas y límites

- Proveedor OTP simulado para alta, login existente, error, límite y expiración.
- Persistencia/reinicio, reemplazo atómico, escrituras concurrentes, refresh rotatorio,
  logout/revocación y namespace distinto a QA.
- Matriz pública/protegida de los seis endpoints; rutas desconocidas no públicas;
  token Passenger no accede a operaciones Driver; QA conserva su boundary.
- Bootstrap de acceso y Passenger, recuperación de solicitud activa y aislamiento
  del bundle de producción frente a módulos DEV/fixtures.
- Ejecuta TypeScript, lint, suite completa y checks de gateway/matching, aislamiento
  de release y bundle pertinentes. Sin dependencias ni cambios nativos salvo que
  una incompatibilidad real lo exija.
- Tests usan OTP simulado. No declares SMS real probado hasta configurar credenciales
  fuera del repo y completar una prueba de extremo a extremo.
- No despliegues Railway, no publiques OTA, no ejecutes EAS Build ni marques QA
  físico como verificado.

Actualiza `docs/PROJECT_STATE.md` y `docs/DECISIONS.md` sólo con comportamiento
implementado y decisiones ya aprobadas. Al terminar reporta branch/HEAD, flujo,
persistencia/seguridad, autorización, validaciones, SMS real (pendiente o probado),
Railway/OTA (sin publicar) y QA físico pendiente.
