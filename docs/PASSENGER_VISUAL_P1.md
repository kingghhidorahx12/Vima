# Passenger P1 — tablero de seis pantallas, implementación local

2026-10-13. Base real: `codex/product-phone-auth-p1-1` @ `2c9018f4` con
auth/acceso P1.1 y mapas operativos P1 pendientes preservados. Sin commit,
push, Railway, OTA ni nueva configuración nativa.

## Superficies

- Home conserva búsqueda dominante, lugares guardados persistentes y hasta tres
  recientes con media aprobada/fallback. Se añade copy del estado vacío real.
  Persistencia, gestión y selección directa no cambian.
- Search conserva lista continua, identidad/orden/ranking, thumbnails, teclado,
  selección, stagger y glow existentes. El primer resultado recibe wash verde
  suave; no se declara seleccionado ni se modifica su identidad.
- Confirmación añade ficha no interactiva del destino real sobre las métricas
  existentes. Campos origen/paradas/destino y su edición permanecen. Loading
  tiene nombre accesible. Precio y pago siguen exclusivamente el contrato actual.
- Matching reutiliza SearchPulse y progreso aprobados, cancelación autoritativa,
  búsqueda prolongada, errores y reconexión. No hay vehículos decorativos/flota.
- Asignado añade jerarquía de título + ETA estimada de recogida del snapshot;
  ARRIVED_PICKUP, IN_PROGRESS y PAYMENT_PENDING presentan su estado real.
  Código PIN permanece disponible durante recogida; deja de ocupar el panel
  tras iniciar el viaje. El PIN/acciones servidor no se modifican.
- Cierre es una superficie propia con check estático, agradecimiento, métricas y
  total **sólo cuando hay settlement** y acción existente de regresar al inicio.
  Usa `settlement.metrics`, nunca duración/distancia estimadas de la quote.
  Cero metros confirmados se conserva como dato válido. Fin anticipado dice
  «Viaje finalizado», sin afirmar llegada al destino. Sin settlement no se inventa
  recibo. Cancelación/expiración conservan el regreso Home del flow y tienen aviso.

Componentes reales reutilizados: VimaText, VimaGlyph, VimaButton, PlaceThumbnail,
surfaces/theme, ElementEntrance, SearchPulse, sheet/shell y todos los hooks de
viaje existentes. `PassengerJourneySummary` sólo presenta datos. No implementa
comandos, matching, tarifas, navegación o persistencia.

## Diferencias justificadas del tablero

- Se conserva la bottom nav sólo Home, la posición/medidas del chrome, snaps y
  controles corregidos, incluyendo Sol/Luna. No se copian proporciones iPhone
  ni se reintroducen overlays que tapen gestos. Contenido puede usar scroll en
  Android compacto; safe areas/mediciones actuales siguen siendo autoritativas.
- Origen/paradas/destino editables se mantienen en confirmación junto a la ficha:
  no se sacrifica información funcional para imitar una ilustración.
- Precio exacto del contrato, no rango ficticio; sin tarifa permanece el estado
  unpriced. Efectivo sólo si está entregado por la quote/settlement. Sin selector
  de pagos, tarjetas, notas al conductor ni categorías de vehículo inventadas.
- No hay contrato de foto del conductor ni foto de vehículo real. Se conservan
  avatar semántico/fallback y metadatos de assignment. La valoración mostrada es
  la del perfil recibido, no una calificación nueva del viaje.
- Llamar/Seguridad son boundaries sin integración en los hosts actuales. Quedan
  disabled salvo capacidad explícita `communicationAvailable` del host; no se
  simula llamada/alerta ni se añade chat/copiar PIN sin implementación.
- No existe operación de calificar, historial/recibos consultables ni soporte.
  El cierre sólo ofrece el regreso funcional al inicio. Sin confetti, nuevo loop
  ni motion fuera de la política vigente.

## Archivos y preservación

- `src/features/passenger/PassengerScreen.tsx`: composición/estados/capacidad
  visual de comunicación; `PassengerJourneySummary.tsx`: fichas de destino,
  estado y cierre; `tests/passenger-visual-p1.test.ts`: regresiones focales.
- Documentación: este archivo, PROJECT_STATE y decisión visual aprobada.
- No se modifican PassengerMap, Camera, route-fit, sedán, fuentes/capas MapLibre,
  telemetry/heading, Motion, auth, Driver, Gateway, matching, lifecycle, pricing,
  cancelaciones, settlement ni contratos. El contenido nuevo participa en las
  mediciones reales existentes; no añade offsets de cámara ni snaps.

## QA pendiente

Focales nuevos 3/3 y suite completa 374/374 PASS. TypeScript, lint, worklets,
schema MapLibre (suite), splash, export Hermes Android/iOS, aislamiento fixture/
server/pricing/paths/credenciales y diff whitespace PASS. Sin cambios de dependencias;
Doctor previo del mismo checkout sigue 20/21 por nueve patches SDK 57 recomendados.

Automatizado cubre ficha/fallback, settlement real o ausente en ambos themes,
revisiones ASSIGNED → ARRIVED_PICKUP → IN_PROGRESS → PAYMENT_PENDING → COMPLETED,
PIN pre-recogida, cancelación bloqueada post-PIN, boundaries sin implementación
disabled y mapa/sheet montados una sola vez. La suite anterior sigue cubriendo
primera medición, búsqueda/selección, route-fit, sedán, comandos/cancelaciones,
offline/reconexión y recuperación de viaje, con dobles nativos.

Android físico **PENDIENTE**: primera apertura sin reinicio; ambos themes en
~20:9 y text scaling; buscar con teclado/autofill, seleccionar/editar y confirmar
con/sin tarifa; matching/cancelar/reasignar; sedán real con GPS y ruta de recogida;
PIN/arribo/inicio, offline/reapertura y recuperación; pago pendiente y cierre
normal/anticipado. Comprobar scroll, CTA accesibles, overlays, pan manual y
Reduced Motion. Automatizado/export no certifican render MapLibre/Fabric físico.
