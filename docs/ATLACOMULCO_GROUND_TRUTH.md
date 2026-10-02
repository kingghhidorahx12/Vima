# Ground truth Atlacomulco P0

Revisión: 2026-10-02. Casos públicos para `npm run geo:smoke`, separados de los unit tests.
No se congelan IDs, respuestas ni coordenadas obtenidos de TomTom. No se usa Google Places.

| Query | Nombre/localidad esperados | Referencia pública | PASS / alias |
| --- | --- | --- | --- |
| Plaza Atlacomulco | Plaza Atlacomulco, Atlacomulco | Vial Jorge Jiménez Cantú 1288, Las Mercedes; [sitio de la plaza](https://plazaatlacomulco.com.mx/) | Resultado provider con Plaza + Atlacomulco, localidad Atlacomulco, Details válido con dirección. Revisar referencia vial en Android. |
| Terminal de Autobuses Atlacomulco | Central / Terminal de Autobuses de Atlacomulco | Atlacomulco de Fabela; [operador CTAA](https://www.ctaa.com.mx/index.php) | Nombre con Central o Terminal y Autobuses, localidad Atlacomulco, Details válido. Central/Terminal son alias aceptados; no confundir agencias de boletos. |
| Centro Universitario UAEM Atlacomulco | Centro Universitario Atlacomulco (UAEMex), Atlacomulco | Carretera Toluca–Atlacomulco km 60; [SIC Secretaría de Cultura](https://sic.gob.mx/ficha.php?table=universidad&table_id=1721), [UAEMex](https://cuatlacomulco.uaemex.mx/conoce-tu-espacio/instalaciones.html) | Universitario + Atlacomulco y localidad Atlacomulco; UAEM/UAEMex puede omitirse por el proveedor. No confundir Universidad de Atlacomulco con este campus. |

El smoke crea el gateway en puerto local efímero, ejecuta Suggest y Discover por caso,
resuelve un resultado **provider** y valida nombre/localidad/coordenada/dirección. Un Local Place
no puede convertir una ausencia del proveedor en PASS. Después prueba geocoding de dirección,
reverse de Plaza y ruta live entre dos lugares resueltos. Un fallo de cobertura se reporta FAIL,
sin imprimir payloads ni sustituirlo por fixtures. La verificación exacta del acceso vial sigue
siendo revisión física: la existencia de un POI no certifica una entrada de recogida.

## Coordenadas estáticas, procedencia y separación

Las siguientes coordenadas públicas son puntos representativos, no entradas levantadas en campo.
© OpenStreetMap contributors, [ODbL y atribución](https://www.openstreetmap.org/copyright).
Se consultaron las fichas OSM publicadas por Mapcarta el 2026-10-02; precisión de la ficha, sin inventar decimales.

| Lugar | [longitud, latitud] | Fuente/elemento OSM | Uso |
| --- | --- | --- | --- |
| Plaza Atlacomulco | [-99.88795, 19.79021] | [ficha pública](https://mapcarta.com/W557484029), [way 557484029](https://www.openstreetmap.org/way/557484029) | Catálogo local independiente, fixture origen/parada y centro inicial DEV |
| Centro Universitario Atlacomulco | [-99.84073, 19.76183] | [ficha pública](https://mapcarta.com/es/W673206593), [way 673206593](https://www.openstreetmap.org/way/673206593) | Catálogo local independiente y reciente DEV |
| Parque Atlacomulco | [-99.8906, 19.79139] | [ficha pública](https://mapcarta.com/es/N11774378268), [node 11774378268](https://www.openstreetmap.org/node/11774378268) | Sólo fixture DEV, reciente y posición de simulación explícita |

`gateway/places.ts` contiene dos registros curados `VimaLocalPlace`. No importa fixtures y no
se genera a partir de ellos. `src/dev/passenger/fixtures.ts` contiene escenarios independientes:
precios, tiempos, trazos rectos y asignación siguen siendo sintéticos, nunca oferta live.
La terminal queda como caso live sin coordenada estática añadida al catálogo.
La dirección y coordenada del usuario no se guardan en este documento ni en logs del gateway.
