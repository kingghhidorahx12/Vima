# Vima Glass Light/Dark P0

Tratamiento aprobado de presentación para superficies secundarias flotantes.
No cambia geometría, jerarquía funcional ni Motion.

## Contrato

- Light: base gris fría translúcida, blur claro, borde y highlight blancos
  contenidos, sombra carbon discreta.
- Dark: base carbón translúcida, blur oscuro, borde y highlight blancos de baja
  opacidad, sombra negra discreta.
- Los verdes, azules, ámbar y rojos semánticos existentes permanecen intactos.
- La geometría siempre pertenece al caller; el glass no define medidas,
  offsets, padding, gaps ni radios.

## Alcance

Se aplica al chrome y controles flotantes existentes, al input Home/Search y a
micro-superficies secundarias sobre el mapa. Passenger y Driver comparten la
misma primitive. El input del `LiveAccountGate` usa el fallback visual porque no
vive sobre el target de mapa. Esto no crea un Login productivo.

Permanecen sólidos `VimaRideSheet`, cards/listas principales, tab bar, CTAs,
Offer Driver, payment/settlement y errores críticos.

## Blur y fallback

`RideShell` mantiene un solo `BlurTargetView` alrededor del viewport de mapa.
Las superficies usan `BlurView` con
`blurMethod="dimezisBlurViewSdk31Plus"`; Android anterior y superficies sin
target conservan tint translúcido, borde, highlight y elevación. El fallback no
reorganiza MapLibre ni añade targets por control.
