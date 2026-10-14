# Driver P1 — presentación aprobada, implementación local

Base real: `codex/product-phone-auth-p1-1` @ `2c9018f4`. Se conservan trabajos
locales de auth/acceso, Passenger P1 y mapas operativos. Referencia única:
«Presentación UI de conductor Vima». Las dos imágenes MOON erróneas se ignoran.
Sin commit, push, Railway, OTA ni nueva configuración nativa.

## Superficies y datos

- OFFLINE: «Estás desconectado» + CTA real «Conectarme», sin modificar el comando
  availability_available. LOCATING: «Localizando tu posición», GPS/red reales y
  desconexión/reintento existentes, sin pasos de progreso simulados.
- AVAILABLE: título y copy existentes, chips semánticos GPS/red, Desconectarme
  como acción principal. PAUSED, errores y reconexión conservan recuperación.
  No se añade switch optimista de disponibilidad. La ubicación se llama
  «disponible», no «precisa»: el snapshot no entrega accuracy.
- OFFER conserva countdown/expiración, pickup real, ETA y acciones sin scroll.
  Se refina la jerarquía, icono de recogida azul y contador con contorno verde;
  el contorno es estático, no finge una fracción de TTL inicial desconocida.
- ASSIGNED/ARRIVED_PICKUP presentan recogida/ETA agrupadas con wash azul en la
  región de resumen medida. Llegué, entrada PIN/Iniciar, no-show, cancelación,
  sincronizar y fences/idempotencia permanecen iguales. La cancelación secundaria
  sigue accesible al expandir/scroll; operación principal y retry permanecen fijos.
- IN_PROGRESS/PAYMENT_PENDING reutilizan controles y métricas existentes, journal
  offline, pendientes, paradas/extras/finalización y settlement. Sin navegación
  nueva ni botones de pago sin comando. No se expone el PIN del Passenger.

## Cuenta y ajustes

Botón accesible de 44 dp dentro del contexto compacto abre una superficie local
de cuenta con nombre/iniciales y vehículo/placa/color del `DriverState.profile`
ya autorizado. Datos sólo de consulta, sin nueva persistencia ni edición.
Tema global persistente (misma autoridad que Passenger) y estado Reduced Motion.
Back/Volver cierra cuenta sin desmontar el shell, cambiar foco de ruta ni parar
watcher/realtime. Un cambio de fase cierra cuenta antes de presentar la operación
nueva, para no ocultar ofertas. No se ofrece navegación de cuenta durante OFFER
o el viaje operativo. Herramientas QA originales siguen en su ruta/DevMenu.

No se fabrica teléfono, foto, ficha de pasajero, ingreso estimado de oferta,
ganancias, documentos, historial, ayuda operativa, aprobación Driver ni cambio
Passenger desde esta cuenta. No existe auth Driver productiva en P1.1 actual;
esta presentación usa el Driver autorizado ya existente detrás de LiveAccountGate.
No se convierte ese gate en login de producto ni se añade otro logout/cambio de rol.

## Geometría y preservación

Se conserva el [viewport operativo](OPERATIONAL_MAPS_P1.md): AVAILABLE 64%, OFFER
53%, ASSIGNED 72% e IN_PROGRESS 77% de mapa útil; paneles 28–52% y 23–48%.
Los mínimos reales medidos de error/acciones prevalecen en Android compacto.
No cambia driverViewport, snaps/gestos, safe areas, camera/padding, pan/recenter
ni el chrome corregido (logo/Sol-Luna/notificaciones/controles). No se traslada
el chrome para copiar las posiciones ilustrativas del tablero.

OFFER vehículo+pickup sin ruta; ASSIGNED routeToOrigin real; IN_PROGRESS sin
ruta ficticia. MapLibre, sedán compartido, heading/interpolación, Theme/Motion
System, Reduced Motion y autoría servidor permanecen. Light/Dark usan la misma
estructura/mediciones; sólo cambian roles de color. Sin barra de navegación normal
que reduzca el mapa. CTA crítico/error/retry nunca se añaden al ScrollView.

## Archivos de esta ronda

- `driverPresentation.ts`, `DriverStatePanel.tsx`, `DriverOffer.tsx`,
  `DriverMapPanel.tsx`, nuevo `DriverAccountPanel.tsx` en `src/features/driver`.
- `src/dev/driver/DriverLiveScreen.tsx`: estado local de cuenta + composición,
  cierre ante fase nueva; los hooks y comandos existentes no se reescriben.
- Tests: expectativas de copy en `driver-presentation.test.ts` y regresiones
  nuevas en `driver-visual-p1.test.ts`. Documentación: este archivo, PROJECT_STATE,
  DECISIONS. Los logs QA ajenos permanecen intactos.

## Validación física pendiente

Focales presentación/viewport/cuenta 18/18; suite completa 377/377. TypeScript,
lint, worklets, MapLibre (suite), splash, Hermes Android/iOS, aislamiento
fixture/server/pricing/paths/credenciales y diff-check PASS. Las expectativas
antiguas sólo se actualizan para copy Conectarme/desconectado/ubicación disponible.
Regresiones nuevas cubren perfil real, ausencia de operaciones sin contrato,
paridad estructural Light/Dark, entrada separada del CTA y cierre por fase sin
remount. No se relaja cobertura. Doctor previo del mismo checkout 20/21 por
nueve patches SDK 57; no se actualizan dependencias.

Dos Android sin USB/Metro después de una publicación autorizada: ambos temas,
primera entrada OFFLINE, conectar, permiso/GPS lento/denegado, AVAILABLE,
abrir cuenta/tema y recibir oferta, aceptar/rechazar/expirar, pan/recenter,
recogida/PIN/inicio, offline/reapertura/reconexión, cancelación pre-PIN,
paradas/finalización/efectivo. Verificar CTA/error/retry completos en ~20:9,
safe area una sola vez, paneles expandibles, mapa protagonista, cuenta cerrándose
al llegar oferta, glyphs/contraste y Reduced Motion. No se declara QA físico PASS.
