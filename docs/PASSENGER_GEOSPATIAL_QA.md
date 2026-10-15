# Passenger: selección y ruta después de cancelar

Ronda local del 2026-10-15 sobre `codex/product-phone-auth-p1-1`, HEAD
`e6de58c1eaa825068ce28b88bad72cd080413bac`. Sin commit, publicación,
Railway, OTA, build ni cambios comerciales. Los dos logs QA se preservan.

## Plaza Atlacomulco: causa reproducida

Consulta real Orbis Places v3 Suggest + Discover, con bias en el punto local
verificado, seguida de Details para cada POI. Dos identidades devolvieron el
mismo nombre **Plaza Atlacomulco** y **Circuito Vial Jorge Jiménez Cantú 1288**:

| Identidad canónica opaca | Details [lon, lat] | Separación aproximada del catálogo |
| --- | --- | --- |
| `tomtom:ab2591cb4dd5ace20f86facb5b6312e8` | [-99.8882, 19.7899] | 43 m |
| `tomtom:657d7b1c2ac2e9649cc2a79df5bcd488` | [-99.92308, 19.8338] | 6,07 km |

La segunda ficha usa CP 50494; la primera CP 50455 y Las Mercedes. No se
deduce equivalencia por nombre únicamente: se revisó también la calle/número
contra la referencia pública del [catálogo verificado](ATLACOMULCO_GROUND_TRUTH.md).
No son Promoda, Boliche ni las sucursales AT&T, que permanecen independientes.

Antes del arreglo: Suggest crea un ID efímero ligado a una referencia Details;
el decoder conserva canonicalId. El catálogo no tenía equivalencias para estas
dos referencias y el comparador sólo buscaba providerRef, descartado por el
decoder móvil. Ambas fichas sobrevivían y podían adelantarse al registro local
en empates. Al elegir la externa, Details se usaba correctamente como destino,
y la cotización enviaba exactamente esa coordenada: el pin/routing no estaban
intercambiando latitud y longitud. El dato del POI ya era incorrecto.

Comprobación real adicional: desde Plaza Hidalgo [-99.8722, 19.8001], la ruta
`fast` a esa ficha externa mide **8.409 m / 1.186 s** y termina en
[-99.9230887, 19.8338029]. Al punto local aprobado mide **2.453 m / 481 s**
y termina en [-99.8878896, 19.790191]. El error se reproduce antes del render.

Corrección: el catálogo conserva [-99.88795, 19.79021] y declara sólo las dos
referencias opacas auditadas mediante el campo providerRefs ya existente.
samePlace reconoce también canonicalId recibido por HTTP. El ranking sustituye
**todas** las referencias equivalentes por el registro verificado y favorece el
local únicamente en empates de relevancia/región/ruido. No hay fusión genérica
por nombre, radio, ni exclusión de otras sucursales. Las pruebas incluyen dos
comercios y otra identidad no revisada del mismo nombre.

El coordinador móvil aplica lo anterior incluso frente al Gateway actualmente
desplegado: selección local con coordenada real → quote del mismo draft → pin
y geometría recibida. No se inventa un acceso: el punto es representativo y el
snap vial lo calcula TomTom.

Preparación de publicación: Recientes/Favoritos y slots previos con esas referencias
auditadas corrigen su coordenada al leer. Se mantienen IDs (incluida eliminación),
nombre, dirección, timestamp y media; sin migración, reescritura ni pérdida del
storage. Identidades de comercios no revisadas permanecen intactas.

Gateway requiere catálogo/identidad/ranking compartidos; OTA requiere esos módulos,
personalPlaces, el adaptador live y flow/superficie de cotización. API compatible,
sin cambios nativos ni dependencias. Routing sigue usando el default fast de Orbis;
gateway/tomtom.ts, pricing, schemas de auth y matching permanecen intactos. Publicar
el mismo commit en product-preview y runtime 0.0.2/product-access-preview; no QA.

## Cancelación y nueva cotización: causa reproducida

Una prueba de React + QueryClient real ejecutó solicitud → cancelar → volver →
buscar → elegir el mismo destino sin desmontar. Antes del fix, gateway.quote se
invocaba **una sola vez**, y la segunda selección heredaba la primera cotización:
la key no identificaba la nueva selección y staleTime Infinity impedía renovarla.
El hook de encuadre ya había consumido esa identidad de ruta, por lo que podía
no emitir otro fit tras la búsqueda. Esto reproduce el defecto de caché/encuadre;
la desaparición física exacta del trazo Android aún requiere repetición en teléfono.

Cada selección aplicada ahora incrementa una revisión local del borrador usada
en queryKey y fingerprint de la operación. El reintento de esa selección conserva
su operación; una selección nueva obtiene otra. La revisión usa una identidad
de operación única, no un contador que colisione al remontar el flujo con caché.
No se cambian fences, identidad
de viaje, cancelación ni reglas de idempotencia de solicitudes/comandos.

La respuesta debe conservar IDs/coordenadas de origen, destino y paradas; el
adaptador live rechaza snapshots de otro borrador antes de etiquetarlos con el
actual. La query valida que exista geometría válida y coincida con los extremos
usando la validación de candidato de fit existente. Una respuesta sin ruta falla
cerrado con «No pudimos calcular la ruta. Reintenta.». No se muestra la ruta anterior
durante la nueva consulta. Reviewing expone carga y no permite avanzar con una
cotización pendiente/ausente. La revisión Home de una solicitud expirada conserva
su acción existente para iniciar el recálculo y todas las paradas.

No cambian PassengerMap, RouteLayer, usePassengerRouteFit, Camera, padding de
confirmación 28 dp, motion, mapa/sheet persistentes ni geometría del shell. Una
cotización nueva emite nuevos fits con las reglas existentes.

## Comparación real Orbis Routing v3: política sin cambiar

Solicitudes de diagnóstico independientes de cotización, 2026-10-15 alrededor de
00:10–00:11 America/Mexico_City. `travelMode=car`, `traffic=live`, sin waypoints,
sin avoids ni heading forzado, maxPathAlternativeRoutes=0. Única diferencia:
`legs: [{ routeType: 'fast' | 'short' }]`. Se pidieron instrucciones para comparar
vías, sin incorporar navegación al producto. Hubo un HTTP 429 inicial; se respetó
el límite espaciando llamadas y completando únicamente las mediciones faltantes.

Puntos públicos: Plaza/UAEM del catálogo; Plaza Hidalgo [-99.8722, 19.8001],
El Oro de Hidalgo [-100.130523, 19.801986] e Ixtlahuaca de Rayón
[-99.767136, 19.570095], obtenidos mediante Discover. Son puntos representativos,
no accesos certificados. Respuestas completas permanecen locales en
`.runtime/geo-qa-routes.json`; no se versionan payloads del proveedor.

| Trayecto | fast km / min:s | short km / min:s | Diferencia short |
| --- | --- | --- | --- |
| Plaza Hidalgo → Plaza Atlacomulco | 2,453 / 8:01 | 2,453 / 8:01 | Igual geometría |
| Plaza Atlacomulco → Plaza Hidalgo | 4,874 / 8:13 | 2,802 / 9:17 | −2,072 km (42,5%); +64 s |
| Plaza Hidalgo → CU UAEM | 7,546 / 13:02 | 7,546 / 13:02 | Igual geometría |
| Plaza Hidalgo → El Oro | 31,953 / 38:11 | 30,439 / 38:52 | −1,514 km (4,7%); +41 s |
| Plaza Hidalgo → Ixtlahuaca | 28,491 / 26:17 | 28,491 / 26:17 | Igual geometría; 148 s de tráfico |

Vías relevantes de las instrucciones reales:

- Hidalgo → Plaza: Miguel Hidalgo, Nicolás Bravo, Mario Colín y Circuito Vial
  Jorge Jiménez Cantú en ambos modos.
- Plaza → Hidalgo: fast usa Carretera Atlacomulco–El Oro, Circuito Vial, Mario
  Colín y Miguel Hidalgo Norte. short sale por Juan de Dios Peza y sigue por
  Mario Colín, Isidro Fabela Norte y José Vicente Villada. short tiene 10
  instrucciones frente a 8: reduce el rodeo, pero usa más calles urbanas.
- UAEM: ambos usan Rafael Fávila, Héroes de la Reforma, Vía Libre Toluca–Atlacomulco
  y el acceso Tecuac–Unidad A.E.M. No se modifica ni certifica ese acceso.
- El Oro: ambos mantienen las carreteras Atlacomulco–El Oro/Atlacomulco–Morelia.
  Cambia el tramo urbano inicial: Rafael Fávila en fast frente a Nicolás Bravo/
  Mario Colín en short.
- Ixtlahuaca: mismo trazo por Isidro Fabela Sur y Toluca–Palmillas. Las respuestas
  incluyen secciones motorway y toll: short **no significa evitar peajes**.

Cada sentido se solicitó por separado; nunca se invirtió una línea. Son rutas
calculadas para automóvil con las restricciones/closures de TomTom, no prueba
en campo de señalización/sentidos. La asimetría ida/vuelta tampoco demuestra por
sí sola que cada desvío sea evitable legalmente. Falta QA vial diurno/hora pico.

Recomendación técnica, **no aplicada**: no sustituir fast globalmente. El retorno
Plaza → Centro justifica evaluar short para urbano por el gran ahorro con +64 s;
intermunicipales muestran un ahorro menor o ninguno y conservan arterias en fast.
Antes de decidir una política, repetir ambos sentidos con tráfico diurno y más
trayectos; acordar tolerancias de tiempo/distancia y calles secundarias. Tampoco
se cambian tarifas: otro trazo afectaría las métricas comerciales y requiere revisión.

TomTom documenta fast como optimización de duración y short como compromiso de
tiempo/distancia, no como distancia mínima absoluta. short puede agotar tiempo
de cómputo en trayectos largos. Referencias oficiales:
[Calculate Route v3](https://docs.tomtom.com/routing-api/documentation/tomtom-orbis-maps/v3/calculate-route)
y [Guidance v3](https://docs.tomtom.com/routing-api/documentation/tomtom-orbis-maps/v3/guidance-instructions).

## Validación automatizada

Preparación de publicación: suite ampliada **407/407 PASS**; TypeScript, lint,
worklets, splash y fixture isolation PASS. Se añade regresión de registros previos
con IDs/timestamps/media conservados, comercio independiente y eliminación por ID.

- Ocho regresiones focales PASS: referencias de Plaza y conservación de comercios;
  selección React → quote/map; cancelar → nueva cotización; loading/ruta ausente/
  snapshot anterior/reintento; respuesta tardía; nuevo review fit + confirm padding
  28; rechazo del snapshot live de otro destino; render MapLibre sin geometría vieja.
- Suite final **406/406 PASS**, incluidos auth, Driver, gateway, matching, lifecycle,
  settlement, geospatial, Passenger shell, MapLibre/style y regresiones anteriores.
- TypeScript, lint, check:worklets, check:splash, check:fixture-isolation y
  git diff --check PASS. No se alteró ningún check para obtener el resultado.
- Sin dependencias ni cambios nativos; no se requiere otro Development Build.
  No se exportó/publicó una OTA ni se modificó Railway.

Archivos de implementación: `localPlaces.ts`, `placeIdentity.ts`,
`regionalRanking.ts`, `passengerGateway.ts`, `usePassengerFlow.ts`,
`PassengerScreen.tsx` y `passengerErrors.ts`. Cobertura en `geospatial-live.test.ts`,
`passenger.test.ts`, `passenger-shell.test.ts` y `map-rendering.test.ts`.

## QA Android pendiente

1. Buscar Plaza Atlacomulco: un resultado del lugar verificado, comercios separados.
   Seleccionar y comprobar pin al sur/Las Mercedes; no San Lorenzo/Manto del Río.
2. Confirmar ruta/precio, solicitar y cancelar. Volver, buscar el mismo lugar y
   otro distinto; comprobar nueva carga/ruta/encuadre sin reiniciar.
3. Red lenta/fallo al cotizar: sin línea vieja, sin solicitud habilitada; Reintenta
   recupera la ruta actual. Repetir offline/reconexión y cambio rápido de destino.
4. Light/Dark, paradas, teclado, modo manual de cámara y Reduced Motion;
   reviewing y confirmación deben incluir todos los pins sin remount.
5. Validar en campo sentidos y entrada permitida de la plaza; el punto curado
   no certifica el acceso de recogida. La política fast vigente no ha cambiado.

Las pruebas con doubles MapLibre verifican el boundary de render, no Fabric/GPU
Android. Auth, Driver, matching, lifecycle, pricing y el backend desplegado no
fueron modificados. El catálogo/ranking compartido también será utilizado por
la búsqueda del Gateway cuando se despliegue explícitamente este código; no
requiere cambiar sus contratos ni su política de rutas.
