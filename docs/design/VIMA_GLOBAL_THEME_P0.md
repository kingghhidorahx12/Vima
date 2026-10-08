# Theme global Vima P0

Decisión aprobada el 2026-10-08. Este documento complementa el handoff Visual
System v1 sin reescribir sus fuentes históricas.

- Vima tiene un solo theme activo por sesión: `light` o `dark`.
- El theme alcanza simultáneamente Passenger, Driver, gates visibles,
  componentes compartidos, chrome controlado por la app y el basemap bundled.
- Driver A/B definió inicialmente la dirección visual; nunca limita el scope.
- Light continúa como default. `EXPO_PUBLIC_VIMA_THEME=dark` es únicamente un
  preview DEV global, no una preferencia de producto y no se persiste.
- Base dark: `#0B0F0E`; superficie: `#121816`; elevada: `#18201D`; texto
  principal: `#F6F8F7`. Los roles semánticos completos están tipados en
  `src/design/themes/` y light/dark implementan el mismo contrato.
- Los assets finales de marca se conservan tal como fueron aprobados. Si una
  superficie futura requiere contraste, debe resolverlo mediante el theme sin
  alterar el asset.
- El Positron/OpenMapTiles bundled puede aplicar la variante Vima dark conocida.
  Styles custom/remotos son autoritativos y no se recolorean. Una variante custom
  dark requiere `EXPO_PUBLIC_MAP_STYLE_DARK_URL`; sin ella se conserva el style
  custom light configurado.
- Selector, persistencia y seguimiento de sistema/horario quedan fuera de P0.
