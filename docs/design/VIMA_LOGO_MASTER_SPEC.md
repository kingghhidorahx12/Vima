# Vima — Logo master / Header lockup

## Estado
**DECIDIDO para implementación P0.**

Estos SVG son masters vectoriales creados desde geometría y tipografía, no recortes de screenshots.

## Archivos

- `vima_symbol_master.svg` — símbolo completo de marca.
- `vima_header_lockup.svg` — símbolo + wordmark horizontal para headers.
- Los PNG `*_preview.png` son solo previews; no son el master.

## Construcción aprobada

- Fondo del símbolo: carbón/casi negro.
- Trama interior: líneas tipo mapa extremadamente sutiles.
- V: brazo izquierdo blanco + brazo derecho verde brillante.
- Pin: rojo `#FF3830`.
- Wordmark: **Vima**, Inter ExtraBold convertido a paths en el SVG.
- No agregar tagline en el header.

## Clear space

Definir `X = 25%` de la altura del símbolo mostrado.

- Clear space exterior mínimo del lockup: `X` por los cuatro lados.
- Separación interna símbolo→wordmark ya está incluida en el SVG; no reducirla.
- No colocar iconos, texto, divisores ni bordes dentro del clear space.

Ejemplo: símbolo de 28 dp → X = 7 dp de clear space exterior.

## Tamaño recomendado en header móvil

### Lockup completo
- Altura visual recomendada: **28 dp**.
- Rango permitido: **26–30 dp**.
- Mantener aspect ratio del SVG.
- No estirar horizontal o verticalmente.

### Símbolo solo
- Uso recomendado cuando el ancho del header sea limitado: **28 dp**.
- Mínimo funcional recomendado: **24 dp**.

El contenedor táctil del header puede ser mayor; estas medidas corresponden al asset visible, no al hit target.

## Alineación

- Centrar verticalmente el lockup dentro del header.
- En el header aprobado: menú/hamburger a la izquierda, lockup Vima centrado visualmente, perfil a la derecha.
- Si el header usa posicionamiento absoluto para lograr centro óptico, conservar el lockup como una unidad; no centrar por separado símbolo y wordmark.

## Fondos

`vima_header_lockup.svg` está diseñado para fondo claro/transparente.

No colocar el lockup sobre un fondo oscuro sin una variante específica aprobada. Para dark theme, preparar una variante cuando se cierre el tema oscuro exacto.

## No hacer

- No recrear el logo con emojis, icon fonts o caracteres.
- No recortar el símbolo desde los boards aprobados.
- No sustituir el wordmark por texto runtime.
- No recolorear el pin.
- No eliminar la trama sutil del símbolo.
- No agregar glow, outline, stroke o sombra externa.
- No cambiar proporciones internas.

## Pendiente

- Variante oficial para dark theme.
- App icon/adaptive icon de producción y sus safe zones específicas de plataforma.
- Versión monocromática si llega a ser necesaria.
