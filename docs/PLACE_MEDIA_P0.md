# Place Media P0

La miniatura es opcional. Search sólo transporta `image?: PlaceImageRef` y nunca resuelve ni
descarga media para ordenar, deduplicar, seleccionar o cotizar. `canonicalPlaceId` continúa
siendo la identidad del lugar. Favoritos y Recientes guardan la referencia estable, no la URL.
La vista resuelve únicamente media Vima aprobada; `source: external` es un contrato futuro
sin proveedor habilitado ni URL construida en P0. No se usan Google Places Photos ni TomTom
POI Photos.

## Catálogo controlado

`VIMA_PLACE_MEDIA_DIR` configura un directorio **fuera del checkout** en el proceso gateway.
Sin variable o manifiesto válido, el catálogo está vacío y todas las filas muestran su
icono Vima por categoría. No hay fallback a fotos de terceros.

```text
VIMA_PLACE_MEDIA_DIR/
  manifest.v1.json
  <assetId>/
    thumb.webp
```

El manifiesto tiene `version: 1` e `images: []`. Cada entrada real necesita:

| Campo | Contrato |
| --- | --- |
| `assetId` | ID estable, minúsculas ASCII/dígitos/guion, 1–80 caracteres; carpeta homónima. |
| `canonicalPlaceId` | ID de un Vima Local Place `verified` ya aprobado. |
| `owner` | Titular de la imagen. |
| `source` | Origen/cesión/compra documentada. |
| `license` | Licencia o permiso de uso verificable. |
| `addedAt` | Fecha ISO válida. |
| `version` | Entero positivo; aumentar al reemplazar el binario. |
| `attribution` | Texto opcional de crédito si aplica. |

Sólo se añaden entradas cuando existe el WebP preprocesado y el permiso real. El loader
comprueba pertenencia al catálogo verificado, tamaño máximo de 2 MB, firma/contenedor WebP,
archivo regular, enlaces simbólicos y ubicación real bajo el directorio configurado. Una
entrada ausente/corrupta no publica `image`. El endpoint
`GET /v1/media/place-images/:assetId/thumbnail?v=<version>` devuelve `image/webp`,
`nosniff` y caché por versión; 404 si falta o no coincide. No expone rutas de disco ni sirve
otros archivos. El proceso no procesa ni redimensiona imágenes.

La app usa `expo-image` con caché `memory-disk`, clave
`place-image:<assetId>:v<version>:thumb` y `recyclingKey` por lugar. El contenedor de 48 px
permanece estable; icono por categoría en loading/error, foto con transición breve al cargar.
La caída de una imagen no se transforma en error de Search.

## Estado del catálogo inicial

No se entregaron binarios propios/licenciados ni documentación de derechos en esta ronda.
Por ello el catálogo real tiene **cero fotos**. Plaza Atlacomulco y CU UAEM Atlacomulco son
los dos Local Places verificados, pero siguen con icono. Terminal, mercados, hospital y
otros lugares sólo recibirán imagen cuando sus entidades y licencias estén verificadas;
no se crean entradas vacías ni lugares artificiales. Aportes `pending` no publican media.

## Revisión inicial de Atlacomulco — 2026-10-06

Se revisaron los dos IDs que hoy admite el catálogo público. La
[galería del Centro Universitario UAEM Atlacomulco](https://scuuap.uaemex.mx/component/speasyimagegallery/album/centro-universitario-uaem-atlacomulco.html)
y la [galería de Plaza Atlacomulco](https://www.plazaatlacomulco.com.mx/galeria)
identifican los lugares correctos, pero en la revisión no se encontró un permiso
o licencia explícita para reutilizar, transformar y servir sus fotos desde Vima.
Los resultados de Commons encontrados corresponden a otros campus o al zócalo,
no a estas dos entidades. Por ello no se incorporó ningún binario, URL ni entrada
de manifiesto: el icono de categoría sigue siendo el fallback correcto.

Para incorporar una foto más adelante se requiere verificar que representa el
`canonicalPlaceId` exacto, registrar titular, URL de origen y licencia/permiso en
el manifiesto existente, preparar `thumb.webp` fuera del checkout y ejecutar los
tests de media y el check de aislamiento del bundle. Esto permite ampliar el
catálogo sin cambiar Search, `PlaceThumbnail` ni el contrato de `SavedPlace`.
