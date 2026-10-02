# Estado real del proyecto

Actualizado 2026-10-02 en codex/tomtom-live-atlacomulco-p0, a partir de
codex/tomtom-geospatial-android-p0 (855be2b), sin modificar esa rama.

## IMPLEMENTADO

- Gateway geoespacial Node+TS local ejecutable, sin framework/dependencia nueva. Healthcheck,
  validación estricta, timeout/abort, rate limit, sesiones UUID con TTL/cleanup y logs sanitizados.
  Config operacional DEV centralizada; sin auth, matching, pagos, base de datos o despliegue cloud.
- Adapters TomTom Places Search v3 Suggest/Discover/Details, Geocoding v2, Reverse v2 y Routing v3
  car + traffic live, campos mínimos y normalización a contratos Vima. Key sólo en proceso servidor.
- Móvil mediante EXPO_PUBLIC_VIMA_API_BASE_URL: autocomplete con debounce/bias, resolución de
  selección, reverse de GPS y ruta real en el mismo shell/MapLibre. Respuestas tardías ignoradas.
  Reverse fallido no invalida coordenada GPS ni sobrescribe origen manual.
- Vista previa geoespacial sin precio/pago inventados; Solicitar viaje deshabilitado en live.
  Sin recientes personales fabricados. Matching completo sigue en fixture DEV explícito.
  No se añadió UI para seleccionar coordenadas tocando mapa; endpoint reverse preparado.
- Ranking puro por relevancia textual y buckets regionales, sin pesos/radios arbitrarios.
  Atlacomulco + Jocotitlán, San Felipe del Progreso, El Oro, Acambay, Ixtlahuaca y Temascalcingo.
  Catálogo servidor de dos VimaLocalPlace verificados y separado de fixtures; dedupe/aliases.
- Fixtures visibles ahora usan Plaza, Parque y CU UAEM Atlacomulco con coordenadas públicas
  atribuidas. Activación exclusivamente DEV con EXPO_PUBLIC_VIMA_FIXTURES=1, sin fallback live.
- Ground truth reproducible (Plaza, Terminal, CU UAEM) y npm run geo:smoke. Documentados nombres,
  referencias, PASS/alias y provenance. Sin datos congelados desde Google/TomTom.
- Splash Android imageWidth183dp (antes160), máximo entero medido con margen1dp dentro de
  círculo seguro192dp. Artwork intacto, sin redesign. iOS280 conservado.

## VERIFICADO UNIT / INTEGRATION Y TOOLCHAIN

- 62/62 tests (47 originales +15), TypeScript, lint, 13 worklet transforms.
- Gateway HTTP real local con upstream simulado: validación, tamaño, sesiones/TTL, límites,
  errores/timeout/cancelación, Search/Details/Geocode/Reverse/Route, campos de tráfico y logs.
- Ranking/dedupe, cliente LAN DEV, selección asíncrona obsoleta, límites de precio/solicitud,
  continuidad del shell y flujo fixture. Unit tests sin Internet ni credencial real.
- Expo Doctor21/21. Config Expo resuelto conserva owner, EAS projectId e identificadores;
  nuevo valor splash183 confirmado. Prebuild Android OK; recursos mdpi–xxxhdpi dentro del círculo
  seguro y manifest debug permite cleartext sólo desarrollo.
- Hermes release Android/iOS correctos; fixtures excluidos de release e incluidos en DEV explícito.
  Bundles Android/iOS DEV y release sin key/header/origen TomTom ni módulo servidor.
- npm run check:splash: radio alpha94.612dp +1dp <=96dp. No equivale a signoff físico.
- Sin nueva dependencia nativa. El cambio de splash requiere reconstruir Development Build.
  No se ejecutó EAS Build ni se instaló toolchain Android/JDK.

## VERIFICADO TOMTOM LIVE

**No verificado**. geo:smoke retorna SKIP explícito: falta TOMTOM_API_KEY en el entorno servidor.
Adapters y pruebas offline no certifican permisos de cuenta, cobertura POI, latencia ni tráfico.
No se han guardado respuestas live ni se presenta ningún resultado simulado como éxito real.

## VERIFICADO ANDROID FÍSICO

**No verificado en esta ronda**. Falta probar desde Android en la misma LAN: conexión al gateway,
permiso/GPS/reverse, búsquedas ground truth, selección/ruta/cámara/markers, teclado, cancelación,
Reduced Motion y splash nuevo. Desactivar Tools button del Development Client para evaluar
capturas de producto; no se intenta eliminar ese control mediante código.

## PENDIENTE

- Credencial servidor con acceso a cuatro web services, smoke live y revisión de direcciones/
  acceso vial de POI. Puntos estáticos son representativos de áreas, no entradas de recogida.
- Configurar URL LAN/HTTPS Vima en móvil y acceso al puerto del equipo; fixtures apagados para live.
- Style Orbis productivo aprobado y credencial pública apropiada si procede. Basemap DEV vigente
  sin cambios: OpenFreeMap Positron sólo fallback de desarrollo; release requiere style explícito.
  No mezclar la key server-only con EXPO_PUBLIC_MAP_STYLE_URL ni improvisar proxy de tiles.
- Nuevo Development Build por splash; también necesario si el APK previo conserva react-native-maps
  de la rama anterior. Revalidar Android físico. No hay APK generado por esta tarea.
- Backend autoritativo de cotización/matching/auth/pagos fuera de alcance; release entry sigue
  sin habilitarse. No se entregó infraestructura productiva.
- Asset vehículo orientado, estilo de ruta por zoom, comportamiento tras pan manual y composición
  terminal15min siguen pendientes. Visual/Motion System, navegación y matching conservados.

## Referencias

[Gateway y Android LAN](../gateway/README.md), [contratos/adapters](TOMTOM_GEOSPATIAL.md),
[ground truth y fuentes](ATLACOMULCO_GROUND_TRUTH.md), [cálculo splash](SPLASH_ANDROID_P0.md).
EAS sigue @kingghidorahx12/vima, developmentClient:true y APK interno.
