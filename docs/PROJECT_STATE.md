# Estado real del proyecto

Fecha: 2026-10-01. Repositorio: `kingghhidorahx12/Vima`, rama local `codex/vima-p0-bootstrap`. La copia partió de un repositorio vacío; el trabajo continúa en el árbol local. No se publicó ni se generó un APK en esta ronda.

## Ronda coordinada P0 vigente

Implementado: **Inicio → selección/edición → Confirma tu viaje → matching normal → prolongado**, dentro del mismo PassengerRideShell, mapa y sheet. Se conserva la asignación existente. Sin rutas, categorías ni pantallas nuevas. Estas reglas sustituyen las anteriores sobre origen y continuación de búsqueda.

- **Header:** lockup raster final aprobado en `assets/brand/vima_header_lockup_final.png`, usado sin modificación y sin tagline. Mantiene el slot 3:1 y 28 dp de alto con hamburger/perfil en los laterales; no hay wordmark runtime. Los SVG/raster v2 anteriores quedan archivados y ya no se usan en la UI.
- **Inicio:** origen compacto editable y destino primario de 52 px, accesos y recientes. Origen loading/automático/manual/no disponible. Ubicación tardía nunca sustituye la selección manual. Destino y origen editables mientras carga; negar permiso no impide continuar manualmente.
- **Ubicación real — IMPLEMENTADO:** expo-location ~57.0.20, consulta en primer plano con permisos del SO y geocoder cuando hay dirección. El host DEV inyecta este adaptador en el gateway existente. Lugares, cotización y matching siguen siendo fixtures aislados; no hay servicios reales de viajes. Sin background location ni servicio de seguimiento. Pendiente de validación en el nuevo Development Build Android.
- **Identidad final Vima:** ícono aprobado integrado en Expo/iOS/Android y lockup institucional aprobado configurado para splash. El PNG original del ícono se conserva intacto; su export 1024×1024 sólo se escala uniformemente para Expo. El adaptive usa el mismo artwork final; se retiraron las capas antiguas de fondo y monochrome para evitar mezclar identidades. El lockup final del header y el logo con slogan del splash se conservan sin procesar en `assets/brand`.
- **Composición:** sheet radio 28/margen 20, altura inicial guiada por contenido y límite para mantener mapa visible. Se retiraron el mínimo artificial de 76%, marginTop:auto y crecimiento vertical que alejaban CTA del contenido. Los offsets 24/52/88 del Visual System limitan el drag; cada estado P0 actual permite sólo su posición funcional al soltar, sin toggle del título ni acciones de accesibilidad para cambiar snap. Motion System y Reduced Motion se conservan. Selección reúne direcciones y Confirmar ubicaciones; confirmación conserva título, mapa, tres métricas, pago y Solicitar viaje. En confirmación, el bloque Origen/Destino tiene margen simétrico interno para equilibrar su posición.
- **Mapa DEV:** sin `EXPO_PUBLIC_MAP_STYLE_URL`, usa OpenFreeMap Positron; una URL configurada prevalece. Release sin URL falla explícitamente. MapLibre 11.4 conserva Camera, RouteLayer, VehicleLayer, DestinationLayer y atribución activa. Un transform de MapLibre añade `User-Agent: VimaMobile/com.kingghhidorahx12.vima` sólo a hosts HTTPS de MapTiler; no contiene credenciales.
- **Splash Android:** el mismo `vima_splash_lockup_final.png` aprobado se presenta con `imageWidth: 160`, `contain` y fondo blanco. Las demás plataformas conservan `imageWidth: 280`.
- **Matching:** matchingPolicy.ts centraliza normal hasta 60 s, espera más larga de 60–120 s, prolongado desde 120 s y límite inicial 15 min. El gateway DEV publica snapshots con reloj inyectable; la UI no fabrica estados autoritativos. Prolongado continúa automáticamente y ofrece Editar / Programar / Cancelar. Se retiraron Seguir buscando y el comando de continuación.
- **Editar / Programar:** cancelación con motivo enviada al gateway y confirmación antes de abrir el borrador/boundary. Una asignación concurrente prevalece. Se conservan origen, destino, paradas y cotización; editar reutiliza el flujo y la siguiente solicitud crea otro ID. Programar entrega la cotización completa al boundary sin inventar UI ni reserva.
- **15 minutos:** estado terminal interno expired; el adaptador detiene timers y rechaza asignación posterior. Conserva el borrador y reutiliza revisión de ubicaciones en el mismo shell. No se inventó composición/mensaje terminal. El backend real deberá imponer/reconciliar la política y deadline; aún no está implementado.
- **Teclado:** blur + Keyboard.dismiss en zonas no editables, toque de mapa y arrastre de lista; keyboardShouldPersistTaps=always y keyboardDismissMode=on-drag. El input conserva sus toques/foco; sin overlay/captura de responder sobre MapLibre. Resultados al primer toque. Falta confirmar gestos en Android físico.
- **DevMenu:** había registro propio y una llamada nativa durante teardown. Ahora registra con pantalla enfocada/app activa, tras un frame; al salir invalida el callback JS sin llamar APIs de Activity. Rechazos reportados sólo en tooling y reintento al volver a primer plano. SDK 57 alineado; sin parches de node_modules. La incidencia ExpoDevMenu.addDevMenuCallbacks / current activity is no longer available requiere revalidación en dispositivo. Tools se desactiva desde su preferencia para QA.

## Validación

Las pruebas cubren ubicación tardía/manual, destino durante carga, fallo de ubicación, umbrales sin esperar tiempo real, continuidad prolongada, cancelación previa a editar/programar, carrera con asignación, fallo de cancelación, expiración y teclado. Verifican una sola instancia de mapa/sheet. Los dobles nativos no certifican gestos ni render Android.

Estabilización del 2026-10-01: **TypeScript y lint OK; 37/37 tests; worklets OK en 13 módulos; Expo Doctor 21/21**. Los tests cubren resolución de style DEV/release, prioridad de URL configurada, header MapTiler restringido por host, snaps válidos single/multi, retorno desde offsets intermedios y Reduced Motion. Expo config público resuelve el splash Android a 160 dp con el PNG aprobado, `contain` y fondo blanco; Android prebuild genera el recurso mdpi con contenido visible dentro de su área (bbox 72,121–215,170 en 288×288). Bundles Hermes Android/iOS exportados y fixture isolation confirma ausencia de fixtures en ambos release. Los dobles nativos no certifican gestos ni render Android.

Introspección Expo: Android COARSE/FINE, sin BACKGROUND_LOCATION ni FOREGROUND_SERVICE_LOCATION; sin background mode iOS. Owner y projectId conservados. Los avisos ya conocidos de detección ESM y deprecación de react-test-renderer no impidieron las pruebas. Hermes requirió permiso de ejecución local fuera del sandbox; se completó la exportación sin build nativo.

## APK

**Se requiere un nuevo Development Build Android** para incorporar el cambio nativo del splash a 160 dp, junto con expo-location y la identidad final ya configurados. El cambio de style y de sheet es JS, pero el APK anterior conserva el splash recortado. La verificación de launcher, splash, mapa, ubicación y drag real queda pendiente de instalar el nuevo APK. No se inició sesión ni se ejecutó EAS Build/Gradle/Xcode en esta ronda.

Validación local 2026-09-30: los tres PNG fuente de identidad se conservan byte por byte y el app icon Expo se exporta a 1024×1024 con escala uniforme. `expo config --type public --json` resuelve icono, splash, lockup, plugin de splash y `expo-location` 57.0.20 con COARSE/FINE_LOCATION. Android prebuild genera iconos legacy/adaptive y recursos de splash; TypeScript, lint, 33/33 tests y Expo Doctor 21/21 pasan. `android/` permanece ignorado y no se añade al repositorio.

## Pendientes reales

- **Style productivo:** MapTiler Cloud Flex basado inicialmente en Streets Pastel está decidido, pero falta la URL real suministrada fuera del repositorio mediante `EXPO_PUBLIC_MAP_STYLE_URL`. Sin esa URL, producción sigue fallando; la apariencia urbana productiva y el mapa Android real aún no están validados.
- **Cámara/recenter tras pan manual:** pendiente de UX; sin recentrado continuo. Los puntos pueden salir del viewport al panear.
- **QA Android:** nuevo APK, permisos/carga/denegación, teclado/primer toque, safe areas, header final, splash 160, Positron DEV, composición/snap y matching, con Tools desactivado. Sin captura/render nativo de esta ronda.
- **DevMenu:** revalidar foreground/background; cualquier fallo residual de Activity se trata como tooling, fuera del producto.
- **Diseño:** composición terminal de 15 min, style urbano, grosores/opacidades por zoom, sprites/vehículo/iconografía final, tema oscuro y variantes de marca.
- **Integración productiva:** backend/contratos reales de lugares, cotización, matching, cancelación, deadlines y programación. El release no activa fixtures ni presenta datos simulados como servicio.

## Base conservada

Expo SDK 57 / RN 0.86.3 / Hermes / New Architecture, TypeScript strict y Expo Router; `expo-splash-screen` 57.0.9 configura el splash nativo. TanStack Query para snapshots/comandos y Zustand sólo UI. Autoridad de servidor, revisión monótona e idempotencia de solicitud. MapLibre 11.4, Reanimated 4.5/Worklets, Gesture Handler y VimaRideSheet propio. Inter local, Visual/Motion System v1 desde JSON aprobados, Reduced Motion y haptics centrales. SecureStore separado de SQLite/KV. Los tres artefactos v1 permanecen intactos.

EAS vinculado a @kingghidorahx12/vima, ID 30422aec-d22b-40f0-8008-c6a316633fd8; developmentClient:true, distribución interna y APK. Exportar JavaScript/Hermes no es compilar ni ejecutar nativamente. Windows sigue sin Android/JDK local; no se repitió esa validación bloqueada.
