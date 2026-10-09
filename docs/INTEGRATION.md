# Contratos para trasladar P0

## Sesión QA Android light/dark

El launcher único coordina, en este orden, Gateway → `/health` → Cloudflare
Quick Tunnel → Metro dev-client `--tunnel` → captura ADB. No requiere copiar la
URL pública: la detecta desde stdout o stderr de `cloudflared` y la inyecta en
Metro como `EXPO_PUBLIC_VIMA_API_BASE_URL`.

Precondiciones externas:

- en Windows, `cloudflared` disponible primero como
  `.runtime/tools/cloudflared.exe` o, como fallback, en `PATH`; en otros
  sistemas sigue resolviéndose desde `PATH`. El launcher valida `--version` y
  no descarga ni instala binarios;
- ADB es opcional. Si `adb devices` devuelve exactamente un dispositivo en
  estado `device`, se captura `adb -s <serial> logcat`. ADB ausente, sin
  dispositivos, con varios, unauthorized, offline o con salida inválida sólo
  produce un warning y la sesión continúa;
- dependencias npm del repositorio instaladas;
- `TOMTOM_API_KEY`, `VIMA_PRICING_CONFIG_PATH` y `VIMA_AUTH_CONFIG_PATH`
  presentes en el environment que inicia la sesión;
- los archivos operativos referenciados permanecen fuera de Git.

Desde PowerShell, después de cargar esa configuración en el proceso:

```powershell
npm run qa:light
npm run qa:dark
```

Light elimina cualquier override técnico previo de theme para Metro; dark
inyecta `EXPO_PUBLIC_VIMA_THEME=dark`. El launcher respeta `VIMA_GEO_HOST` y
`VIMA_GEO_PORT`; el default sigue siendo `127.0.0.1:8787`. Los logs separados
se guardan en `.runtime/qa/<timestamp>-light|dark/` como `gateway.log`,
`tunnel.log` y `metro.log`; `adb.log` se crea sólo cuando inicia logcat.
`.runtime/` está ignorado por Git. Ctrl+C, SIGTERM o la salida inesperada de
Gateway, cloudflared o Metro cierran el árbol completo. Una salida posterior
de ADB sólo detiene esa captura y no termina QA. Ningún log imprime valores de
configuración sensible.

## Visual y motion

Las fuentes de verdad P0 están en `docs/design/`: `vima.visual.final.json`, `vima.motion.final.json` y `VIMA_VISUAL_MOTION_HANDOFF_FINAL_v1.md`. Los adaptadores importan los JSON directamente, manteniendo sus nombres y valores; el Markdown gobierna reglas, semántica y límites. No editar copias de tokens en componentes. Las reglas funcionales aprobadas y el alcance de la solicitud prevalecen. El primer bloque de pasajero autorizado después del bootstrap se documenta en [PASSENGER_P0.md](PASSENGER_P0.md).

`RootProviders` carga archivos locales Inter 400/500/600/700 con `expo-font` y monta el único `VimaThemeProvider` productivo. Light es el default; `EXPO_PUBLIC_VIMA_THEME=dark` selecciona dark para toda la app sólo en DEV. Los aliases de archivos no cambian la familia aprobada. `VimaText` ofrece h1/h2/h3/bodyRegular/bodyMedium/bodySmall/caption; `textStyle` exige una elección explícita dentro de Display 32–36 y Body 400–500. No se añade line-height o letter-spacing. `VimaSurface` ofrece screen/contrast/subtle/sheet/card/buttonPrimary/inputPrimary y ambos themes implementan las mismas keys y roles semánticos tipados. `primaryGradient` conserva posiciones 0/58/100%; su uso sigue restringido por el handoff, no se aplica a toda la UI.

La elevación usa `boxShadow` de New Architecture con los offsets/blur/spread/opacidad exactos. `elevationStyle` requiere color explícito porque el handoff no lo fija; no añade sombras por defecto a todas las cards. El dark global aprobado se documenta en [VIMA_GLOBAL_THEME_P0.md](design/VIMA_GLOBAL_THEME_P0.md); assets maestros, librería/stroke de iconos y paddings/min-widths pendientes no reciben valores provisionales.

`motionTokens` expone todas las duraciones, curvas, stagger, reglas de interacción y restricciones. `motionTimings` liga press/release/focus/navigation/sheet/map/success a esos tokens. Las curvas se evalúan como cubic-bezier CSS (inversión de x), también en worklets. `moveTo` hace snap con Reduced Motion; `fadeTo` permite progreso de opacity/color. Ningún helper retrasa una acción crítica esperando animación. No se han creado loops de producto, pantallas, springs ni umbrales de gran salto.

`ScreenTransition` se monta una vez por pantalla aprobada, nunca por fase del viaje: 16 px + opacity / 240 ms, sólo fade con Reduced Motion. El Stack mantiene su animación nativa desactivada para no superponer curvas del sistema. Se cancela en blur; la ruta técnica lo consume. La política central también expone búsqueda estática y desactiva ambient gradient/loops/scales con Reduced Motion. Los futuros loops sólo podrán correr mientras la app y su superficie estén visibles.

`semanticHaptics` resuelve los 13 eventos exactos del JSON a impactos light/medium o notificaciones success/error/warning. Es best effort; no confirma operaciones. Invocar eventos de éxito de viaje/PIN/pago sólo tras la respuesta autoritativa correspondiente. Reduced Motion no elimina información ni altera la semántica háptica. El fixture sólo invoca `buttonChip` al cambiar su contenido.

## Shell y sheet

Montar `PassengerRideShell` o `DriverRideShell` una vez en la ruta del viaje. Pasar el viaje obtenido mediante TanStack Query a `renderPhase`. No usar `key={trip.phase}`, no condicionar el shell por fase ni navegar entre fases. Mantener estable la configuración del mapa; su source/layers reciben datos actualizados.

`createRideSheetInteraction(alturaDisponible, índiceSnap)` deriva los offsets para alturas visibles 24/52/88% (índices 0/1/2). Medir el área útil del shell después de considerar safe areas; la pantalla elige el snap según contexto. Memorizar la interacción para no reiniciar motion al cambiar sólo el contenido. El sheet usa superficie blanca, esquinas superiores 28, entrada 300/enter, cierre 240/exit y snap 300/state sin rebote. `open=false` cierra sin desmontar el shell/mapa. Con Reduced Motion resuelve el offset inmediatamente, conservando el drag 1:1.

Se conserva el contrato de bajo nivel `RideSheetInteraction`. Su función `settle` debe ser worklet; el factory utiliza el snap más cercano, sin umbral de velocidad/distancia inventado. Los límites de activación/fallo del gesto son opcionales, sin números visuales arbitrarios: pueden aportarse al resolver la convivencia con controles/scroll de una pantalla aprobada. Un simple tap no cancela ni cambia el snap. No hay handle dibujado: sus dimensiones exactas no se proporcionaron. Sin geometría el componente sigue siendo un contenedor estático; no calcula una altura productiva por su cuenta.

## Mapa y movimiento

La integración vigente está en [TOMTOM_GEOSPATIAL.md](TOMTOM_GEOSPATIAL.md): MapLibre móvil con modelos Vima neutrales, style TomTom Orbis pendiente y web-services exclusivamente detrás del backend Vima. Los tipos paint/layout/sprites de MapLibre no son el contrato de las features.

`VimaMap` usa la URL pública. `Camera` usa `setStop` con duración cero si Reduced Motion está activo o falta motion aprobado; con motion aprobado usa su duración. No se seleccionó viewport de producto.

`mapColors` resuelve origen verde, destino rojo, completado gris, comunicación azul y espera ámbar. `locationColor` exige contexto azul/verde; `routeColor` exige tono activo carbón/verde profundo. No se selecciona contexto por heurística.

`RouteLayer` exige `state`, `activeTone`, width y opacity Vima; los valores por zoom siguen pendientes. Dibuja la geometría autoritativa durante 420/state; con Reduced Motion conserva la geometría completa y hace fade. `reveal=false` muestra la ruta inmediatamente. Cambiar sólo propiedades o identidad JS no reinicia el reveal; sí cambiar la geometría. El segmento completado transiciona a gris con el token map. El adaptador de backend debe suministrar los segmentos reales activo/completado; no se deducen con datos ficticios. La propuesta de cambio de ruta no sustituye la ruta vigente hasta confirmación.

Las animaciones de ruta actualizan propiedades/geometría de la fuente GeoJSON nativa desde worklets; no hay `setState` por frame. `VehicleLayer` usa el círculo aprobado para el estado actual y transporta heading interpolado en GeoJSON; un símbolo de vehículo orientado requiere asset aprobado. Los pines de origen/destino conservan su artwork Vima actual.

El transporte escribe `VehicleSample` en un `SharedValue` estable. `VehicleLayer` consume ese valor sin un `setState` por muestra/frame. Interpolación y serialización GeoJSON corren en worklets y actualizan la fuente nativa mediante `useAnimatedProps`. La salida visual se limita a 12 Hz, dentro del rango técnico de 10–15 Hz solicitado. La cadencia no es un timing de producto.

`createVehicleMotion(shouldSnap)` conecta el token map=420/state al contrato `VehicleMotionConfig`; el criterio `shouldSnap` sigue siendo obligatorio porque no hay umbral de gran salto aprobado. Las funciones deben ser worklets. Sin configuración, con Reduced Motion o con `reconnected`, aplica snap según el contrato técnico previo. `VehicleSample` exige posición, heading finito [0,360) y secuencia autoritativa; no se inventa una orientación norte cuando falta heading. La posición cruza el antimeridiano por el trayecto corto y el heading cruza 360/0 por el arco corto. Una muestra nueva continúa desde la pose visual actual.

Marcar la primera muestra tras reconexión con `reconnected: true`; usar secuencias crecientes para descartar muestras fuera de orden. Crear una nueva fuente de muestras al cambiar la identidad del vehículo. La cámara conserva su contrato explícito y duración cero con Reduced Motion: la API MapLibre sólo expone linear/ease/fly, por lo que no se equiparan arbitrariamente a las curvas Bézier del handoff.

## Autoridad y persistencia

Implementar `TripGateway` con el contrato real. Sus respuestas deben proceder del servidor; `execute` sólo resuelve cuando el estado resultante está confirmado. `useCriticalTripCommand` no tiene `onMutate`, actualización optimista ni retries automáticos. Una falla puede ser ambigua: reconciliar y mostrar estado pendiente/error según P0, nunca éxito inventado. El `commandId` se transportará según la semántica de idempotencia real del backend.

Las revisiones de `AuthoritativeTrip` son el contrato interno de reconciliación; el adaptador de backend deberá mapear una revisión monótona real. Respuestas tardías no sobrescriben revisiones nuevas. Los eventos realtime invalidan la consulta y obligan a leer el estado autoritativo; no escriben fases a Zustand.

Zustand sólo tiene el estado efímero de habilitación de interacción del sheet. SecureStore conserva la credencial. SQLite/KV expone únicamente preferencias y un snapshot con versión, ID opaco de viaje, revisión y fecha; reconstruye una lista permitida al escribir/leer para excluir campos adicionales. El snapshot no incluye fase, ubicaciones, identidad de personas ni pagos. No añadir campos sensibles ni usar un identificador que contenga información personal. Tras restaurarlo, consultar al servidor; jamás hidratar el cache de viajes como si estuviera confirmado. Limpiar snapshot/cache/credencial al integrar cierre o cambio de cuenta.

No existen endpoints, sockets ni sesiones productivas ficticias. Las respuestas sintéticas están aisladas en `tests/` y en el adaptador explícito de `src/dev/passenger/`, autorizado para recorrer visualmente el primer bloque de pasajero. Ese adaptador no se importa desde servicios productivos y se excluye de los bundles release.
