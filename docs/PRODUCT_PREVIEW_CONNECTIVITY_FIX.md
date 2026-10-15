# Conectividad tras OTA product-preview — 2026-10-14

OTA afectada: `01a13d89-c007-7733-ad9e-8d9876ee76a6`, grupo
`41f678e9-88cb-4ee1-a4f8-a8c460ef1635`, commit `8c185d6`, runtime `0.0.2`.

## Evidencia antes de modificar

- APK original `930e649e-6cfc-45bb-9488-af26ed35ed13`, commit `d7356734`:
  el bytecode de `productAuthClient` carga el Gateway productivo correcto.
- El manifiesto servido por Expo coincide con el SHA-256 del bundle exportado
  y publicado: `4idHjNT-HpptmqLrgAxungeaNOSMmUzIV8ttgnyTCPE` (base64url).
- En ese bytecode, `productAuthClient` carga `https://product.example.invalid`,
  aunque otros módulos contienen el Gateway correcto. También queda la URL de
  validación `https://map.example.invalid/style.json`. Por eso buscar solamente
  la presencia del host correcto produjo una validación insuficiente.
- EAS production y la configuración del APK tienen como destino real aprobado
  `https://vima-gateway-product-production.up.railway.app`. Canal exclusivo
  `product-access-preview`, runtime `0.0.2`.
- El cliente singleton toma la URL inlineada del bundle. SecureStore conserva
  tokens, no el destino. startOtp no requiere una sesión guardada. El fallo de
  DNS hacia `.invalid` se convierte en network_recoverable antes de llegar a
  Railway; /ready desde Chrome no prueba el destino usado por ese cliente.

## Corrección acotada

- Toda exportación mediante export-native limpia la caché Metro antes de
  transformar módulos. La exportación anterior reutilizó transformaciones con
  valores EXPO_PUBLIC de una validación sintética, produciendo un bundle mixto.
- check-release-isolation rechaza ambos destinos sintéticos, incluso cuando
  el destino aprobado también aparece. Regresiones de pipeline y bundle mixto.
- Se retira «Ya tengo sesión · Continuar»: sólo invocaba restauración local.
  Las cuentas existentes entran mediante teléfono y OTP; restauración automática
  y recuperación con error/reintento permanecen. No se modifica SecureStore,
  credenciales, cuentas, autorización ni capacidad Driver.
- Verificar el destino dentro de la función compilada productAuthClient después
  de exportar con production y caché limpia; no basta leer process.env ni buscar
  una URL correcta cualquiera en el bundle.

Entrega autorizada exclusivamente Android/product-access-preview, environment
production, runtime 0.0.2. Sin Railway, QA, otro APK, borrado ni reinstalación.
QA físico pendiente: recibir la OTA por apertura/cierre normal, solicitar OTP y
confirmar llegada al Gateway, acceso de cuenta existente y sesión preservada.

Validación de la corrección: focales 13/13 y suite completa 398/398 PASS;
TypeScript, lint y aislamiento de Hermes Android/iOS PASS. Tras exportar con
production y --clear, el desensamblado de productAuthClient carga el HTTPS
productivo; desaparecen ambos destinos sintéticos. Sin cambios de variables EAS.
