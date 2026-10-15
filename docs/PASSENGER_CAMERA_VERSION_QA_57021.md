# Passenger P1 — versión instalada y zoom, QA 57021

Base real: `codex/product-phone-auth-p1-1` @
`d7c9cbc8794d5b81bc89586ddae9642fe2f51420`, OTA de referencia
`01a140b9-9aca-783d-90ef-6e927f761971`. Árbol tracked limpio al empezar;
los dos logs QA locales permanecen intactos y sin seguimiento.
Tras la implementación local se autoriza commit/push y OTA Android sólo en
`product-access-preview`, environment `production`, runtime `0.0.2`.
Sin Railway, APK nuevo ni cambios en otros canales.

Video inspeccionado: `C:/Users/nexar/Downloads/57021.mp4` (90,86 s, 580×1280).
Aproximadamente 35 s: revisión de Preparatoria UAEM; 40–50 s: confirmación
con la ruta mucho más pequeña; 55 s: matching; 70–75 s: Plaza/confirmación/
matching. El video es evidencia del defecto anterior, no QA del cambio local.

## Causas demostradas y corrección

1. `PassengerMap` sumaba pin + 28 dp de seguridad en todos los bordes y otros
   28 dp inferiores en confirmación; reservaba también el pin y ambos márgenes
   de la columna derecha acumulativamente. La base ya contenía chrome/sheet.
   En un mapa de 390×820 dp, top medido 96 y sheet 500, el padding anterior era
   top 171 / bottom 565 / left 53 / right 113: sólo 224×84 dp para la geometría.
   Ahora es top 143 / bottom 528 / left 28 / right 88: 274×149 dp útiles.
   Es un ejemplo reproducible de cámara, no una medida extraída del teléfono.
2. Las holguras se combinan por **máximo** en cada borde: pin completo o 28 dp,
   conservando una sola oclusión medida y la columna de controles. Los 28 de
   `confirmationBottomPadding` permanecen como requisito mínimo dentro de esa
   misma holgura inferior, sin agregarlos una segunda vez. Reviewing conserva
   su padding previo. No se cambia la ruta, sus extremos ni el renderer nativo.
3. El token incluía el nombre de cada fase: el mismo borrador/viewport generaba
   otro `setStop` al pasar CONFIRM → REQUESTING. Una regresión nueva falla en la base d7c9cbc
   con sequence 2 frente a 1. Tras corregirlo, CONFIRM/REQUESTING/MATCHING comparten
   intención cuando ruta y geometría ocupada son equivalentes. Un panel/chrome
   realmente diferente sigue autorizando un fit; GPS y rerenders no lo hacen.
4. Las medidas de layout del contenido podían alcanzar el tamaño final antes
   de terminar el translate del sheet. El fit espera ahora que la altura visible
   reportada por el sheet coincida con esa geometría. Sin temporizadores nuevos,
   cambios de snaps/motion ni cambios al scroll Home. Si la fase siguiente tiene
   idéntica altura, el último footprint real sigue siendo válido sin exigir un
   callback nativo que no tiene por qué repetirse.

MapLibre sigue calculando la escala a partir de bounds completos y padding.
No se fija zoom, se recorta geometría ni se altera bearing. Pan manual suspende
la intención y «Recentrar ruta» usa la última geometría estable. Search lock,
rechazo de cotizaciones incompatibles, padding imposible y Reduced Motion se
conservan. Camera compartida/Driver no se modifican.

## Acerca de Vima

Sección informativa discreta al final del Perfil productivo, después del cierre
de sesión. Conserva nombre, ajustes, logout y navegación existentes.

- Versión del APK: `ExponentConstants.manifest`, config **embebida en el binario**
  que exporta el módulo Expo Constants ya incluido en SDK 57. Se admite el JSON
  string Android y el objeto; metadatos ausentes/inválidos muestran «No disponible».
  No se usa `Constants.expoConfig.version`, que puede proceder de una OTA distinta.
- Actualización: `expo-updates.updateId` de la versión que está ejecutándose,
  abreviado a los primeros 13 caracteres; no la última descargada ni publicada.
- Se distinguen OTA instalada, actualización incluida en el APK, desarrollo y
  datos no disponibles. No se afirma «última versión», ni se consulta/descarga/
  aplica una OTA desde Perfil. No requiere dependencia, permiso ni build nativo.

## Validación y límites

Regresiones: metadata nativa/OTA/embedded/desarrollo/ausente; Perfil Light/Dark
con ajustes/logout intactos; comandos nativos por fase, bounds completos,
holgura única, pan/recenter, geometría imposible y cambio de oclusiones;
layout final con sheet aún en movimiento no autoriza fit; continuidad sin remount.
Los tests anteriores de cancelación/recotización, sesión, Home y scroll se conservan.

Archivos de esta ronda:
- Perfil: `src/features/auth/ProductAccountScreen.tsx`, `AboutVima.tsx`, `appVersion.ts`.
- Cámara Passenger: `PassengerMap.tsx`, `PassengerScreen.tsx`, `usePassengerRouteFit.ts`.
- Tests: `tests/app-version.test.ts`, `passenger-route-viewport.test.ts`,
  `passenger-shell.test.ts`, `passenger.test.ts`, `product-access-ui.test.ts`.
- Documentación: este informe, `docs/PROJECT_STATE.md`, `docs/DECISIONS.md`.

Las pruebas usan límites nativos simulados, incluidas formas cortas/largas y
ambas políticas de movimiento. No prueban el render Android real ni llaman TomTom
para regenerar rutas. Suite completa final **423/423 PASS**; focales de cámara/
versión **4/4 PASS**, confirmación explícita **2/2 PASS**; TypeScript, lint,
worklets, fixture isolation y diff-check PASS. Se adaptaron dos simulaciones
anteriores de layout para emitir también el footprint nativo de fin de movimiento;
la regresión nueva rechaza expresamente un fit antes de ese evento.
Los hashes de ambos logs QA coinciden con el estado previo.
Validación repetida para publicación: **423/423 PASS**, TypeScript, lint,
worklets, splash, fixture isolation y diff-check PASS.
La publicación autorizada exporta con caché limpia bajo EAS production. Se
publica ese mismo bundle Android,
comparando el manifiesto/bytecode servido con su SHA-256 local. Sin Railway
ni APK nuevo; la publicación no cambia el estado físico PENDIENTE.

Export limpio EAS production: Hermes Android/iOS y aislamiento release/QA PASS.
La constante exacta de productAuthClient en ambos bytecodes carga
`https://vima-gateway-product-production.up.railway.app`, sin destinos `.invalid`.
La implementación de «Acerca de Vima» también está presente en el export Android.
SHA-256 Android (base64url): `wZCBq1x3u9S9iFYPoVMg2q1qPThsrr4jmKADgN3TJ9Q`.
La subida usa ese export validado sin recompilarlo.

## QA físico PENDIENTE

1. En ambos teléfonos, abrir Perfil: versión del APK e ID instalado; comparar el
   ID con la actualización realmente recibida. Probar ambos temas, scroll y logout.
2. Android compacto ~20:9, Light/Dark: origen real → Plaza Atlacomulco y origen
   real → Preparatoria UAEM. REVIEW → CONFIRM → REQUESTING → MATCHING: ruta y ambos
   pines completos, legibles y a máxima escala útil; sin alejamientos intermedios.
3. Cancelar y repetir con el mismo/otro destino. Ruta/distancia/tarifa corresponden
   al borrador actual; no se reutiliza geometría anterior.
4. Cambiar panel/oclusión; sólo tras estabilizarse se ajusta el encuadre. Pan/zoom/
   rotación manual no se interrumpen; Recentrar ruta recupera la ruta completa.
5. Reduced Motion, offline/reconexión y demora al solicitar: sin loops de cámara,
   saltos sucesivos ni regresiones de Home/controles. No se modifica matching.
