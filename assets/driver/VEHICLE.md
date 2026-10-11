# Vehículo aprobado — PNG cenital

`vehicle-approved-source.png` es una copia exacta del PNG aprobado por el usuario
el 2026-10-10. SHA-256:
`122d51574d491b256cb059112269f71e9df98d9e740fcfecc55260799a036ec9`.

No se dibujó ni generó un coche nuevo. El original 1024×1536 ya contiene alpha.
Los píxeles del coche con alpha > 8 delimitan el rectángulo
`left=282, top=234, width=460, height=1014`; fuera quedan márgenes y residuos
prácticamente transparentes. No se alteró el color ni el alpha dentro del recorte.

Preparación técnica con Sharp (herramienta local, sin dependencia de la app):

1. Extraer ese rectángulo del original.
2. Añadir padding transparente simétrico: 100 px izquierda/derecha y 43 px
   arriba/abajo. Materializar este resultado como PNG antes del resize.
3. Reducir proporcionalmente el canvas 660×1100 a 30×50 (`vehicle-approved.png`),
   60×100 (`@2x`) y 90×150 (`@3x`) con el filtro Lanczos3 predeterminado.
4. Dejar completamente transparente la fila/columna exterior de cada exporte,
   eliminando el residuo de alpha del filtro en el padding (sin tocar la silueta).

Con `icon-size=1`, el canvas mide 30×50 dp y la silueta ~20.91×46.09 dp. Se conserva
la proporción estrecha del original en lugar de ensancharlo a 30 dp. Frente hacia
arriba/norte y pivote central; sin rotación adicional ni deformación. El mismo PNG
se registra bajo ambos nombres light/dark existentes; Metro resuelve la densidad.
El source original no se importa en el bundle. Los SVG/PNG anteriores se retiran.

El halo one-shot es una Layer independiente existente; no forma parte del artwork.
