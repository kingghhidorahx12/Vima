# QA release interno: EAS Update + Railway

## Estado y precondiciones
Implementación local; Railway, EAS Build, canal remoto, OTA y dispositivo PENDIENTES.
No se han desplegado servicios ni publicado updates. Producción permanece bloqueada.
Proyecto EAS existente: 30422aec-d22b-40f0-8008-c6a316633fd8. Node >=22.13.

## Variables EAS
Crear variables en EAS environment preview: EXPO_PUBLIC_VIMA_VARIANT=qa,
EXPO_PUBLIC_VIMA_API_BASE_URL (dominio HTTPS Railway), EXPO_PUBLIC_MAP_STYLE_URL
(HTTPS aprobado), EXPO_PUBLIC_TOMTOM_DISPLAY_KEY (clave pública restringida para Display).
No activar EXPO_PUBLIC_VIMA_FIXTURES. Development usa variante development, production
usa production en sus respectivos environments. Build y Update leen la misma variable
pública; el perfil QA falla si no recibe qa. No colocar secretos servidor en EAS ni .env Expo.
IDs: com.kingghhidorahx12.vima.dev / .qa / base; nombres Vima Dev / Vima QA / Vima;
schemes vima-dev / vima-qa / vima. Los tres APK pueden coexistir.

## Railway (provisionamiento manual)
Conectar este repo/rama a UN servicio Railpack Node, desactivar despliegue automático si
se requiere control manual; no configurar CI/CD. Una réplica, una región, sin escalado horizontal.
Montar volumen persistente /data ANTES de arrancar; VIMA_GEO_RUNTIME_DIR=/data;
VIMA_BACKEND_MODE=qa; Node >=22.13 (RAILPACK_NODE_VERSION=22).
Start: node --experimental-strip-types gateway/main.ts. Railway provee PORT; escucha
0.0.0.0. Crear dominio HTTPS y healthcheck /ready. No exponer directamente el puerto:
el modo QA confía en x-forwarded-proto=https del proxy Railway, además de Bearer.

Provisionar con acceso administrativo privado al volumen: /data/config/pricing.json,
/data/config/auth.json y catálogo/media aprobados bajo /data/media. Usar los schemas
existentes en gateway/pricing/config.ts, matching/auth.ts y placeMedia.ts; conservar archivos
fuera de Git. Subirlos mediante herramientas de volumen/SSH Railway; permisos restrictivos.
Variables servidor: TOMTOM_API_KEY, VIMA_PRICING_CONFIG_PATH=/data/config/pricing.json,
VIMA_AUTH_CONFIG_PATH=/data/config/auth.json, VIMA_PLACE_MEDIA_DIR=/data/media.
Nunca imprimir tokens, contenido de archivos ni entorno. Los tokens se entregan por canal
privado al tester y se ingresan en Cuenta QA/SecureStore. No se incluyen en URLs de imágenes;
media QA lleva Authorization y no usa caché de disco.

/health conserva liveness. /ready devuelve 503 hasta tener TomTom configurado, pricing/auth
válidos y coordinador durable recuperado; 200 entonces. No comprueba cobertura TomTom.
Corrupción/migración/persistencia fallida impide readiness; conservar archivos y .tmp como
evidencia, restaurar desde backup auditado, nunca borrar snapshot para conseguir verde.
El volumen contiene matching-v1.json (schema v4): respaldar antes de actualizar. Reiniciar y
comprobar IDs/revisiones/lifecycle conservados. Un volumen implica breve downtime al redeploy.

## Build e instalación (pendientes de autorización operativa)
Con sesión EAS y preview ya provisionado:

    eas build --platform android --profile qa

Configurar una vez el vínculo channel qa → branch qa (crear si no existen):

    eas branch:create qa
    eas channel:create qa --branch qa

Si ya existe: eas channel:edit qa --branch qa. Nunca apuntar production a qa.
Instalar APK QA junto a Dev. PC/Metro apagados: abrir Passenger, ingresar token válido,
cambiar a Driver mediante Cuenta QA / cambiar modo y enlaces existentes; validar restore,
rol incorrecto, limpiar/cambiar cuenta, viajes y reinicio. Producción no habilita live.

## OTA y runtime

    eas update --channel qa --environment preview

preview debe seguir definiendo EXPO_PUBLIC_VIMA_VARIANT=qa. No usar variables de otro environment.
updates.url usa el proyecto existente; runtimeVersion policy appVersion y app.version=0.0.2.
JS/UI/assets compatibles pueden ir por OTA. Dependencias/config/código nativos requieren
incrementar app.version, reconstruir e instalar APK. OTA JAMÁS sustituye el binario nativo.
Tras publicar una modificación JS identificable, cerrar/reabrir según el comportamiento normal
EAS Updates (descarga en un arranque, aplicación en siguiente); comprobar runtime y canal.
No updater propio. Esta incorporación expo-updates requiere nuevo Development Build y APK QA.

## QA local preservado
npm run qa:light / npm run qa:dark mantienen Gateway → health → Quick Tunnel → Metro,
ADB opcional. No configurar VIMA_BACKEND_MODE=qa para ese launcher local. No volcar secretos
en logs. .runtime y logs privados no se versionan.

Referencias oficiales: https://docs.expo.dev/build-reference/variants/,
https://docs.expo.dev/eas/environment-variables/usage/,
https://docs.expo.dev/eas-update/runtime-versions/,
https://docs.railway.com/deployments/healthchecks,
https://docs.railway.com/volumes/reference.
