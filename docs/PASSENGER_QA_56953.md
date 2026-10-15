# Passenger P1: QA físico 56953 — correcciones locales

Base inspeccionada: `codex/product-phone-auth-p1-1` @
`3afef0d52b66cc40864369206a8137ab6c2fda3f`. Árbol inicial sin cambios tracked;
sólo los dos logs QA ajenos, preservados. Las dos rondas de implementación se
realizaron sin commit, push, build, Railway ni OTA. Después, el usuario autorizó
commit/push y publicación OTA Android exclusivamente en product-access-preview,
environment production, runtime 0.0.2. No requiere cambios de Gateway ni otro APK.
El despliegue Railway product-preview existente no se modifica.

Video revisado: `C:/Users/nexar/Downloads/56953.mp4`, 1:58,85, 580×1280.
Alrededor de 5–15 s aparece restauración y timeout; después del reintento aparece
Home. A continuación se ve ruta → solicitud → cancelar; alrededor de 55–75 s
continúa selección con lugares conservados y termina con pins sin línea visible.
El final muestra cuenta y Home oscuro. Revisar un video previo no verifica el fix.

## 1. Restauración: presupuesto consumido antes del HTTP

`RootProviders` espera fonts/theme antes de montar las rutas. La entrada `/auth`
ejecuta current; éste lee SecureStore, refresca access expirado si procede,
persiste la rotación y valida `/v1/auth/me`. Passenger reutiliza la validación
cacheada y después recupera identity/solicitud activa, sin otro login QA.

Dos límites se solapaban: ProductAuthScreen imponía 12 s a toda la secuencia y
el transporte iniciaba otros 12 s antes de readCredential/access (incluido refresh).
El refresh tenía además su propio plazo. Una respuesta `/me` rápida en un reintento
no demuestra que el primer intento haya tenido sus 12 s disponibles en la red.

Reproducción determinista sin SMS/servicios reales: lectura 6 s, refresh 7 s,
persistencia 1 s, `/me` 5 s. Todas las operaciones cumplen sus límites individuales.
El código de HEAD termina en timeout; el árbol corregido restaura la cuenta,
conservando credenciales en ambos. Comparación ejecutada sin reemplazar archivos
del checkout, en `.runtime/qa56953-before-after.test.cjs`. La UI antigua, además,
cortaba el proceso a los 12 s desde el inicio. No se atribuyen al dispositivo esos
tiempos sintéticos ni se afirma disponer de una traza distribuida del primer intento.

Corrección: eliminar el deadline global duplicado de la UI y empezar el deadline
del HTTP protegido **después** de obtener la credencial. SecureStore conserva
8 s, refresh/OTP/HTTP normal 12 s y long-poll su plazo específico 30 s. No se
aumenta ninguno. withCancellation permite dejar de esperar una operación compartida
sin abortar el refresh de otros consumidores ni una escritura nativa no cancelable.
La generación de identidad se verifica antes de iniciar HTTP y al recibir respuesta.

Se conservan refresh único concurrente, revocación/401 cerrado, serialización de
SecureStore, logout, namespace QA separado y descarte de respuestas tardías. Red
transitoria no limpia la sesión. El progreso real de restauración sigue visible;
los fallos efectivos mantienen Reintentar/volver. RootProviders no cambia.

## 2. Cancelación: lugares preservados pero query deshabilitada

El fix anterior renovaba correctamente la cotización al **reseleccionar**. Faltaba
el caso inmediato posterior a cancelar: act conserva el borrador del snapshot,
pero submit había dejado confirming=false. Los snapshots pueden omitir metadata
opcional de los lugares. Esos mismos IDs/coordenadas generan otra queryKey, sin
data, y enabled=confirming impedía cotizar. El pin usa origin/destination pero
PassengerMap recibe quote undefined: no hay RouteLayer ni candidato de fit.

Una regresión con React + QueryClient y snapshot reconstruido reproduce ese
camino sin volver a seleccionar: la query ahora emite otra cotización autoritativa.
Se habilita cotizar/renovar también durante edición y tras cancelled/expired,
siempre con borrador válido y conexión online. La expiración usa el mismo criterio.
Durante matching/assigned no se cambia la autoridad ni se altera la quote congelada.

Se conserva una ruta cacheada que corresponda al borrador; cuando cambia la key
se calcula la nueva, sin prestar geometría de otro destino. Siguen vigentes los
checks de identidad/coordenadas/paradas y geometría de la ronda anterior, el loading,
el error recuperable y CTA bloqueado cuando falta ruta válida. Distancia/tarifa/línea
proceden del mismo snapshot. No hay conectores ni rutas sintéticas.

La cotización nueva alimenta el fit existente cuando se miden header/content/
viewport actuales. Se conservan fit reviewing, confirmación +28 dp y padding real.
El fit se consume una vez: pan/scroll/rerenders no recentran al usuario. Search
mantiene su bloqueo de cámara y presentación de ruta previo; al cerrarse, vuelve
la ruta del borrador. PassengerMap, RouteLayer, Camera y usePassengerRouteFit no
cambian: no se aplica una corrección nativa especulativa al renderer.

## 3. Home: touch surface del scroll y pan del header

El ScrollView nativo tenía pointerEvents=box-none, igual que sus wrappers
transparentes. Eso excluye al propio nodo scroll como target aunque deja sus
descendientes táctiles: no es una política válida para la superficie nativa que
debe reconocer el arrastre. Además el header mantenía un pan de sheet con un único
snap Home; podía reclamar un gesto que no permitía cambiar el estado final.

El ScrollView recupera hit testing normal, flex:1 para delimitarlo al viewport
medido y nestedScrollEnabled Android. Los wrappers transparentes siguen box-none:
los huecos exteriores siguen llegando al mapa. Home pasa headerPanEnabled=false
al VimaRideSheet existente; la prop es opt-in y default true, por lo que Driver y
el resto de estados mantienen sus gestos. No se añade otro sheet ni otro snap.

Home conserva 50%, buscador 58 dp, gap, controles, bottom nav y máximo 3 recientes;
el resto sigue accesible en Ver todos. Pruebas con sheet real en el harness para
ambos temas, 0/1/3/8 recientes y frames compactos verifican scroll/gestos/estructura.
Los doubles no simulan el reconocedor Android; el desplazamiento físico requiere QA.

## 4. Vima Local: ocultación visible aprobada, catálogo intacto

Discovery entrega PlaceSuggestion sin coordinate. Sus IDs canónicos locales no
son elecciones registradas en session.choices. Sin sesión, createPlaceSearch.resolve
rechazaba; incluso con sesión, el Gateway no admite un ID ajeno a sus choices. Se
reprodujo el no_result sin solicitar Details externo ni fabricar coordenadas.

El usuario aprobó explícitamente **ocultar sólo Vima Local**. Se retiran únicamente
su título y filas del bloque Discovery vacío de Search. Permanecen catálogo
verificado, ranking, referencias TomTom de Plaza, corrección de guardados, búsqueda
local textual, señalización y contratos. No hay migración ni borrado de favoritos.

Decisión ampliada aprobada: resolver lugares locales sin depender de una sesión
TomTom que no contenga la elección. createPassengerLiveGateway.resolvePlace ahora
acepta exclusivamente coincidencias exactas de ID con status=verified en
approvedLocalPlaces. Devuelve el registro/coordenada revisados y cierra cualquier
búsqueda externa pendiente. Respeta AbortSignal; IDs externos/desconocidos siguen
por el resolver de sesión existente, sin relajar Details ni la autoridad servidor.

Esto también corrige las sugerencias locales de Populares, que conserva su
presentación. La búsqueda textual sigue integrando el catálogo normalizado y
deduplicado. Plaza y UAEM se prueban mediante React/QueryClient y el adaptador live,
tanto desde búsqueda normal como desde sugerencias sin coordenadas: selección →
petición de cotización → respuesta autoritativa decodificada → endpoint de ruta
en el mapa. El transporte de prueba usa respuestas sintéticas; no es QA de rutas
reales. No cambia el servidor, los IDs, referencias revisadas, ni storage/metadata
de favoritos, recientes o Casa/Trabajo. No se añade una sesión TomTom artificial.

## Validación y QA pendiente

Resultados finales con resolución local: suite completa **415/415 PASS** y
focales locales nuevos **3/3 PASS** (incluye cuatro recorridos UI: dos lugares ×
búsqueda/Populares). La ronda previa pasó focales integrados **127/127**,
scroll/ocultación/encuadre/presupuesto **4/4** y comparación HEAD/árbol actual del
timeout **2/2**. TypeScript, lint, worklets, splash, aislamiento de fixtures y
git diff --check PASS. No se hizo export/build; las pruebas
existentes de aislamiento release forman parte de la suite, no de un bundle nuevo.

Preparación de publicación: se repitieron suite **415/415**, TypeScript, lint,
worklets, splash, fixture isolation y diff-check con PASS. No hay cambios de
servidor/contratos/configuración nativa ni dependencias que requieran Railway/APK.
La exportación y la inspección del bundle de esta publicación son pasos adicionales
a las pruebas anteriores; el recibo EAS identifica la OTA, sin acreditar QA físico.

Exportación de publicación comprobada: EAS production, dotenv desactivado, Metro
--clear, Hermes Android/iOS e aislamiento release/entrada producto PASS. Se resuelve
el índice de LoadConstString de productAuthClient contra la tabla de strings de
Hermes: valor exacto https://vima-gateway-product-production.up.railway.app en ambos
bundles, sin destinos .invalid. SHA-256 Android (base64url):
`Bz5y1M0g4EBIgm-wHt7LSg2eVNN7tXLCmkKIrSoekaA`. Se sube este bundle sin rebundling,
sólo Android/product-access-preview, runtime 0.0.2. iOS se valida, no se publica.

Implementación: `src/services/auth/productSession.ts`, `src/services/api/deadline.ts`,
`src/features/auth/ProductAuthScreen.tsx`, `src/features/passenger/usePassengerFlow.ts`,
`src/features/passenger/PassengerScreen.tsx`, `src/design/components/VimaRideSheet.tsx`,
`src/services/geospatial/passengerGateway.ts`.
Pruebas: `product-session.test.ts`, `product-access-ui.test.ts`, `passenger.test.ts`,
`passenger-shell.test.ts`, `geospatial-live.test.ts` y harness `passenger-renderer.cjs`.
Documentación: este archivo y PROJECT_STATE.md. No se alteraron los logs QA.

Regresiones: presupuesto por fase en frío, cancelación durante refresh, UI sin
timeout global/volver con respuesta tardía, cancelación con snapshot reconstruido,
scroll acotado/gesto Home y ocultación exclusiva con catálogo conservado. Se ejecutan
también sesión vigente/expirada, offline/reconexión, logout, 401, refresh concurrente,
long-poll real de prueba 25 s, cotizaciones tardías, selección local, geometría,
render MapLibre y encuadre sin remount de las suites anteriores.

Pendiente en dos Android, sin marcar PASS hasta repetir con esta versión:

1. Arranque frío/caliente, access vigente/expirado, red lenta y offline. Restaurar
   sin Reintentar cuando cada fase funciona; fallo real recuperable sin perder sesión.
   Volver/logout durante restauración no deben navegar por una respuesta tardía.
2. Solicitar → cancelar conservando lugares: ruta completa o carga/error recuperable.
   Reseleccionar mismo/otro destino; confirmar distancia/tarifa/pins/encuadre coherentes.
   Cambiar destino rápido, cancelar red y reconectar; ninguna geometría anterior.
3. Pan manual tras el fit y scroll de panel sin recenter repetido. Revisar Android
   20:9 compacto, teclado y safe areas. Todos los pins deben caber sobre el panel.
4. Home Light/Dark: alcanzar las tres filas existentes y Ver todos, scroll sobre
   títulos/filas/espacio libre, mapa arrastrable fuera del panel, controles y bottom nav.
5. Search no muestra Vima Local; buscar Plaza y UAEM, seleccionarlos y confirmar
   ruta/tarifa reales con sus coordenadas verificadas. Repetir desde Populares si
   aparecen allí; guardados y media deben conservarse. Probar con sesión TomTom
   previa y sin ella, cancelar la selección y reconectar sin reutilizar otro destino.

Sin dependencias ni cambios nativos. Para la publicación autorizada se repiten
suite, TypeScript, lint, worklets, splash y aislamiento. La exportación usa EAS
production con caché Metro limpia después de las pruebas; se verifica el destino
HTTPS efectivo dentro de productAuthClient en Hermes y se bloquean URLs sintéticas.
Se publica el mismo bundle comprobado, sin volver a compilarlo al subirlo.
Auth servidor, matching, lifecycle, pricing, routing fast, Driver, otros canales,
configuración QA y credenciales no se modifican. QA físico sigue PENDIENTE.
