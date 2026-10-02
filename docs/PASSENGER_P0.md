# Bloque P0 de pasajero

## Recorrido DEV

La entrada abre /dev/passenger; /dev/bootstrap conserva el fixture técnico anterior. Usar npm start con un Development Build que incluya **expo-location**. El APK previo a esta ronda requiere rebuild; aquí no se ejecutó.

Controles sólo en el menú del Development Client: **Vima · controles de prueba**. Abrirlo agitando el teléfono y desactivar **Tools button** para QA. No hay franja técnica ni launcher propio en producto. Fixtures aislados en src/dev/passenger y excluidos del release.

1. Inicio muestra Origen editable y Destino primario. Ubicación real del SO puede cargar, fallar o denegarse sin bloquear selección manual. La elección manual prevalece sobre respuestas tardías. Casa/Trabajo usan búsqueda; Favoritos sigue como representación pendiente de datos/contrato.
2. Seleccionar/editar reutiliza la lista existente. Confirmar ubicaciones abre confirmación: direcciones, paradas, duración/distancia/precio, pago y Solicitar viaje.
3. Solicitar espera al gateway. Matching normal 0–60 s; copy discreto 60–120 s. Desde 120 s aparecen Editar / Programar / Cancelar; continúa automáticamente sin botón de continuación ni desmontar mapa/shell.
4. Editar espera cancelación confirmada antes de abrir el borrador. Fallo/offline conserva matching; una asignación concurrente prevalece. Se conservan origen/destino/paradas; la siguiente solicitud crea otro ID.
5. Programar espera cancelación y entrega la cotización completa al boundary. No hay nueva UI de programación ni reserva. El fixture explica ese límite sólo en tooling.
6. A 15 min el gateway emite expired y detiene matching; conserva el borrador y reutiliza revisión de ubicaciones. Composición/mensaje terminal siguen pendientes. Asignación conserva el bloque anterior; sin aceptar conductor, iniciar viaje, pago final ni rating.

## Contratos y tiempos

matchingPolicy.ts centraliza lateAfterMs=60000, prolongedAfterMs=120000 y limitMs=900000. No son motion. El gateway admite reloj/política inyectables y publica por el transporte existente; recalcula al leer aunque se suspendan timers. El backend real deberá imponer esos límites. La app no confirma estados optimistamente.

PassengerGateway es un adaptador interno, sin endpoints inventados. request(quote,requestId) crea nueva solicitud; editar/programar usa cancel con motivo edit/schedule y requiere estado confirmado cancelled/expired. Una asignación más reciente prevalece por reconciliación.

Los 700 ms de transporte de solicitud, 400 ms de comando y 5200 ms del escenario opcional de asignación son demoras de fixtures. Prolongado permanece activo hasta cancelación/asignación/límite. Los controles sólo DEV pueden adelantar fases. No hay vehículos ficticios para aparentar oferta.

locateCurrentPlace usa expo-location/geocoder en primer plano. Permiso no requerido para entrada manual. Lugares, recientes, tarifas, trazados y viajes siguen siendo fixtures, sin backend productivo.

## Presentación y teclado

Header v2 transparente, 28 dp visibles, sin texto runtime. Derivado PNG del SVG original porque el stack utiliza Image; sin nuevo módulo SVG. Originales/spec/board en repositorio. Sheet radio 28, margen 20, destino 52 px, CTA 56 px. Altura inicial por contenido, mapa visible, snaps/Motion System conservados.

La lista preserva primer toque con keyboardShouldPersistTaps=always. Superficie no editable, mapa e inicio de scroll llaman blur/Keyboard.dismiss. El input detiene sólo la propagación de su touch JS para mantener foco. Sin captura de gestos de MapLibre; validación física de teclado pendiente.

## Límites

src/map/style.ts no cambió: URL autoritativa y Demo Tiles sólo DEV. Demo regional/mundial, no style urbano aprobado; amarillo no prueba un bug. Style/proveedor y recenter tras pan manual pendientes, sin cambios a layers/Camera.

Faltan style final, grosores/opacidades por zoom, iconografía/sprites/vehículo, composición terminal, tema oscuro e icono/splash. El nuevo board rige composición; el prompt prevalece en reglas: Origen siempre visible y Confirmar ubicaciones no solicita automáticamente el viaje.

Las pruebas React con dobles nativos verifican flujo/callbacks/montaje, no píxeles ni gestos del teléfono. DevMenu sólo registra con pantalla enfocada/app activa y no llama nativamente durante teardown. Errores residuales de Activity requieren comprobar el Development Client.
