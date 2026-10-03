# Dirección visual Passenger P0 — 2026-10-03

La [referencia compartida](references/passenger-direction-2026-10-03.png) es la guía
principal de acabado UI/UX del Passenger P0. Su logo, wordmark, tagline, splash ilustrado
y cualquier identidad diferente quedan expresamente excluidos: se conservan los assets Vima.

## Traducción a la implementación existente

- Superficies blancas y neutras claras, radios existentes 12/16/28/pill, bordes de carbón
  al 8%, profundidad de los niveles 1/2 existentes. El verde oscuro al 6% sirve de fondo
  de énfasis; los lavados de azul, rojo y ámbar se reservan a sus roles semánticos.
- Verde para acción/éxito/origen; azul para ruta/ubicación/foco/mapa; rojo destino/cancelación.
  No se copia la paleta de branding del board. Los CTA del pasajero usan verde oscuro sólido
  para mantener contraste; el gradiente original continúa disponible para otros contextos.
- Inter con interlineado 1.35; iconos Material Symbols regular ya integrados. Search de 52 dp,
  CTA de mínimo 56 dp, controles del mapa de 48 dp y back de 44 dp. Se permite crecer al texto.
- Resultados, origen/destino, métricas y conductor usan las mismas superficies. El precio
  sólo recibe énfasis cuando existe; el pago ausente permanece explícito y no accionable.
- Conductor conserva nombre/rating/ETA/placa/PIN y acciones existentes. Avatar de perfil
  neutral porque el contrato no trae foto; vehículo con imagen sólo si la entrega el host.
- Motion más contenido: control 0.98, halo ubicación 1.18 con menor opacidad, highlight
  de ruta 0.16 y rebote de pin 0.5 dp. Launch de app: escala 1.01, salida 480 ms/8 dp;
  Reduced Motion conserva crossfade 160 ms. Sheet conserva timings, snaps y gestos existentes.
- Traffic mantiene colores y datos; trazo 2.5 dp al 60%, debajo de casing blanco/ruta azul.
  Basemap, cámara y contratos TomTom permanecen configurados como antes.

## Límites

No se incorporan categorías, tabs, acceso/login, mensaje, compartir, fotos ficticias ni un
compass personalizado. No se altera navegación, ranking, pricing, matching ni gateways.
El splash nativo y sus assets/configuración permanecen intactos; se pule el launch de app.
El style productivo final del mapa continúa pendiente. La referencia no autoriza inventar datos.

## Verificación visual

Se revisaron siete composiciones de los componentes con fixtures mediante una proyección HTML
local: Inicio, Search, resultados, selección, confirmación, matching y conductor. La proyección
omite mapa, usa dobles de límites nativos y no certifica layout Yoga, tiles, gestures ni Android.
El signoff requiere Development Build en teléfono, con Traffic ON/OFF y Reduced Motion,
textos largos/ampliados, teclado, safe areas y estados sin precio/pago/fotos.
