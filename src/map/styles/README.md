# Passenger basemap

`positron.json` is the unmodified style downloaded on 2026-10-05 from
https://tiles.openfreemap.org/styles/positron, the basemap already used by Vima.
Upstream: https://github.com/hyperknot/openfreemap-styles.

`../basemap.ts` applies the approved Passenger colors to named paint properties:
urban `#F7F8F7`, secondary roads `#F5F6F7`, main roads `#EBEBEB`, secondary greens
`#ECF6EF`, parks `#D8EEDB`, water `#BFDDF9`. It preserves layer order, filters,
zoom limits, widths, opacity, labels, tile sources, fonts and sprites. Route,
pins and traffic remain separate Vima layers with their existing styling.

Only the existing Positron URL resolves to this bundled style. Other explicitly
configured style URLs remain authoritative. Production still requires
`EXPO_PUBLIC_MAP_STYLE_URL`; the local fallback does not authorize a production provider.

The renderer retains attribution, including Positron/CartoDB design credit.
Upstream notices and licenses are retained in `LICENSE.md`.
