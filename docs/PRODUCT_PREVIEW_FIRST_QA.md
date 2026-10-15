# Correcciones locales del primer QA product-preview — 2026-10-14

Base: `d7356734f27bf17ec34dce73d2345319dcbb9607`. Se preservan los cambios
locales de despliegue/documentación y la corrección del contenedor del logo.
No commit, push, build, Railway ni OTA en esta ronda.

Ronda posterior autorizada: checkpoint Git y OTA exclusivamente Android al canal
`product-access-preview`, rama EAS del mismo nombre, environment `production`,
runtime `0.0.2`; mismo APK instalado y backend intacto. No publicar en `qa` ni
`production`. La autorización de entrega no equivale a QA físico aprobado.

Para recibirla: abrir Vima product-preview con internet, dejar completar la
descarga en segundo plano y cerrar completamente/reabrir. Si el primer arranque
sigue con el bundle anterior, repetir una vez. No desinstalar ni borrar datos:
se deben conservar sesión y lugares guardados para validar persistencia.

Validación final: suite completa 396/396 PASS (incluye regresiones focales OTP,
acceso/cuenta, favoritos, matching con directorio vacío, cancelación y montaje),
TypeScript, lint, worklets y diff-check PASS. Pruebas con dobles nativos y servidor
local; no equivalen a comprobar composición IME o render del dispositivo Android.

- OTP: existían dos capas sobrepuestas: texto React en casillas y TextInput
  nativo con sólo `color: transparent`. La composición/autofill Android puede
  dibujar spans nativos independientemente de ese color. Se oculta el input
  completo con opacity 0, manteniendo su tamaño, interacción y accesibilidad.
  Sigue existiendo una sola entrada controlada; las casillas son presentación.
  Se conserva SMS autofill, foco, teclado numérico y verificación. El límite
  nativo permite pegar texto con separadores; `otpDigits` sigue limitando el
  valor efectivo a seis dígitos. Render Android real aún pendiente de repetir.
- Acceso: el maestro PNG ya tiene alpha. La corrección local elimina darkBrand
  blanco. No se inventa una variante clara del wordmark; contraste pendiente.
  El formulario deja de centrarse dentro de todo el espacio flexible: comienza
  bajo el logo, con padding superior 8 y margen de heading 8. Se conservan
  safe areas, ScrollView, teclado y controles.
- Home: no se cambian bootstrap, mediciones, cámara ni montaje del mapa/sheet.
  No se aportó una ruta de video utilizable para verificar los segundos 36–39;
  el tramo inicial debe inspeccionarse antes de atribuirle otra causa.
- Favoritos/Casa/Trabajo: sí existe persistencia local real en SQLite kv-store,
  inyectada al gateway productivo mediante mobilePersonalPlaces. Se mantienen
  las claves versionadas, sanitización, metadata y selección directa; no hay
  sincronización backend nueva ni promesa de almacenamiento remoto.
- Matching: el contrato no comunica conteo de conductores ni disponibilidad
  garantizada. La política vigente mantiene SEARCHING hasta 15 minutos y luego
  NO_DRIVER_FOUND; el cliente no debe declarar el terminal antes del servidor.
  Se elimina el copy que garantiza conexión y se informa del límite real desde
  matchingPolicy. Cancelar sigue disponible. Programar no tiene implementación
  productiva: se omite su boundary y botón en producto; QA con boundary conserva
  su comportamiento. No cambian comandos, cancelación ni tiempos del backend.

Para terminar anticipadamente cuando el directorio está vacío, se debe acordar
una regla autoritativa en servidor (incluyendo altas/disponibilidad posteriores).
No se implementa detección heurística de cero conductores ni nuevos contratos.

QA físico pendiente: ambos temas, Android ~20:9, tecleo/pegado/autofill y borrado
OTP, foco/teclado/back/reenvío, registro, primer Home sin reinicio, GPS degradado,
guardar/eliminar/reabrir favoritos y slots, Search/ruta/tarifa, cancelar matching,
estado final sin conductor, offline/reconexión y Reduced Motion. No se declara
ningún recorrido físico verificado por las pruebas React/Node.
