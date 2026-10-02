# Vima — App Icon P0

**Estado:** cerrado para la próxima integración nativa P0.  
**Fuente de verdad:** geometría del símbolo Vima ya aprobada. Estos archivos son derivados técnicos, no un rediseño.

## Masters vectoriales

1. `vima_app_icon_master.svg`
   - Master de identidad del app icon.
   - Conserva el campo carbón redondeado, trama de mapa, V blanca/verde y pin rojo.

2. `vima_ios_icon_master.svg`
   - Master iOS full-bleed.
   - Sin transparencia ni esquinas redondeadas manuales; iOS aplica su propia máscara.

3. `vima_android_legacy_master.svg`
   - Master para Android legacy.
   - Fondo redondeado con transparencia exterior.

4. `vima_android_adaptive_foreground_master.svg`
   - Foreground transparente del adaptive icon.
   - Solo símbolo V + pin.
   - Sin sombras: respeta la guía de adaptive icons.

5. `vima_android_adaptive_background_master.svg`
   - Background full-bleed carbón + trama sutil de mapa.

6. `vima_android_monochrome_master.svg`
   - Símbolo monocromático para themed icons Android 13+.
   - Una sola silueta; el sistema aplica el tint.

## Exports listos para Expo / EAS

Todos son PNG `1024×1024`:

- `vima_ios_icon_1024.png`
- `vima_android_legacy_1024.png`
- `vima_android_adaptive_foreground_1024.png`
- `vima_android_adaptive_background_1024.png`
- `vima_android_monochrome_1024.png`

Expo/EAS genera los tamaños de dispositivo a partir de estos masters 1024×1024.

## Android Adaptive Icon — safe zone

Android define capas conceptuales de `108×108 dp`.

- Safe zone garantizada: `66×66 dp` centrada.
- Reserva exterior para máscara/parallax: `18 dp` por lado.
- El símbolo Vima se redujo mínimamente respecto al master combinado para quedar dentro de la safe zone con margen.
- No mover, agrandar ni volver a escalar el foreground por plataforma sin nueva revisión visual.

## Config Expo sugerida

```json
{
  "expo": {
    "icon": "./assets/branding/vima_ios_icon_1024.png",
    "ios": {
      "icon": "./assets/branding/vima_ios_icon_1024.png"
    },
    "android": {
      "icon": "./assets/branding/vima_android_legacy_1024.png",
      "adaptiveIcon": {
        "foregroundImage": "./assets/branding/vima_android_adaptive_foreground_1024.png",
        "backgroundImage": "./assets/branding/vima_android_adaptive_background_1024.png",
        "backgroundColor": "#0B0F0E",
        "monochromeImage": "./assets/branding/vima_android_monochrome_1024.png"
      }
    }
  }
}
```

`backgroundColor` queda como fallback; `backgroundImage` es la capa visual aprobada y tiene prioridad cuando está configurada.

## iOS

- Usar `vima_ios_icon_1024.png`.
- 1024×1024.
- Opaque.
- Full-bleed.
- No aplicar radio de esquina dentro del archivo.
- No agregar wordmark/texto.

## Android legacy

- Usar `vima_android_legacy_1024.png`.
- 1024×1024.
- Transparencia exterior deliberada.
- Mantiene la apariencia aprobada del icono redondeado en launchers antiguos.

## Android monochrome

Sí corresponde incluirlo:
- Android 13+ puede usar themed icons cuando existe capa monochrome.
- Mantiene la silueta Vima; no intenta conservar rojo/verde porque el sistema la tinta.

## No hacer

- No recortar screenshots.
- No sustituir Vima por el lockup horizontal.
- No meter la palabra `Vima` dentro del launcher icon.
- No cambiar el pin rojo en las variantes a color.
- No añadir glow/luz.
- No recolorear el fondo.
- No añadir sombra al adaptive foreground.
- No aplicar esquinas manuales al icono iOS.
- No agrandar el adaptive foreground fuera de la safe zone.

## Master vs export

**Masters:** todos los `.svg`.  
**Exports de build:** los cinco `.png` de 1024×1024.  
**Preview:** `vima_app_icon_preview.png`; no usar en app/build.
