# Pricing P0

El gateway Vima es la única autoridad. `POST /v1/passenger/quotes` valida el draft,
clasifica sus coordenadas con regiones configuradas en el servidor, obtiene TomTom
Routing y crea una cotización inmutable en memoria. No existen pagos ni solicitudes
live en este bloque. El próximo contrato de solicitud es `{ quoteId, requestId }`.

## Configuración externa

Configurar `VIMA_PRICING_CONFIG_PATH` en el proceso del gateway antes de iniciar
`npm run geo:gateway`. Puede ser absoluta o relativa al directorio de trabajo. No usar
`EXPO_PUBLIC`, ni guardar la configuración comercial en Git. La configuración se lee
y valida al iniciar; cambiarla requiere reiniciar el gateway. `version` identifica
el conjunto de tarifas/regiones y queda en cada snapshot. No hay tarifa de fallback.

La siguiente estructura es documental y **no ejecutable**. Los textos entre `< >`
deben reemplazarse por valores aprobados; no se proporciona ninguna tarifa comercial:

```text
{
  version: <identificador de versión>, currency: "MXN",
  profiles: {
    URBANO: { baseMinor, minimumMinor, distanceMinorPerKm, durationMinorPerMinute, additions? },
    REGIONAL: { baseMinor, minimumMinor, distanceMinorPerKm, durationMinorPerMinute, additions? }
  },
  regions: [{ id: <municipio>, polygon: <anillo cerrado de [longitud, latitud]> }],
  intermunicipalOverrides: [{
    id, fromRegionId, toRegionId, direction: "both" | "one-way",
    rateOverride?: { baseMinor?, minimumMinor?, distanceMinorPerKm?, durationMinorPerMinute? },
    additions?: [{ code, kind: "toll" | "extra", label, amountMinor }]
  }],
  quoteTtlSeconds: <entero positivo; omitido = 300>,
  rounding: { incrementMinor: <entero positivo>, mode: "half_up" }
}
```

Dinero en centavos enteros no negativos y seguros. `rounding` omitido significa
un centavo, half-up. No se eligió redondeo comercial a pesos ni tarifas reales.
Identificadores únicos; overrides no ambiguos; extras únicos dentro de cada tarifa
efectiva. No se infieren peajes desde TomTom, nombres de calles o carreteras.

Los polígonos son configuración operativa externa, no se inventaron límites
municipales. P0 admite anillos simples cerrados (hasta 2048 vértices); no huecos ni
MultiPolygon. Límites compartidos, solapamientos o puntos sin región única producen
`pricing_unavailable`. Deben suministrarse límites aprobados adecuados a este contrato;
no usar cajas aproximadas como sustituto de municipios. `regionId`, nombre/dirección
del cliente y Search ranking no determinan la tarifa.

Todos los puntos en una región → URBANO; varias regiones → REGIONAL. Un override
dirigido coincide origen→destino; `both` también invierte el corredor. Una parada en
un tercer municipio desactiva el override y aplica REGIONAL. Se combinan únicamente
campos de tarifa explícitos y adiciones explícitas; no hay motor de reglas genérico.

## Cálculo y snapshot

```text
metered = base + meters × ratePerKm / 1000 + seconds × ratePerMinute / 60
fareBeforeExtras = max(minimum, metered)
total = fareBeforeExtras + configuredExtras
```

Duración: `trafficDurationSeconds ?? durationSeconds`; `durationSource` queda como
`traffic` o `static`. No representa surge. El motor puro usa BigInt con denominador
común 3000 para conservar fracciones de centavo y redondea el total una sola vez.
Valida overflow antes de exponer números JS. El desglose contable entero trunca
subtotales para representación, asigna el residuo entero a duración y registra la
diferencia final en `roundingAdjustmentMinor`; estas asignaciones nunca alimentan
el cálculo. El total utiliza la fracción exacta, incluso con un incremento > 1.

Snapshot: id, fechas en epoch milisegundos, configVersion, profile/overrideId,
draft con paradas, ruta normalizada, métricas y desglose en minor units. Se clona y
congela recursivamente. No se acepta precio, distancia, duración o perfil del móvil.

## Endpoint y ciclo de vida

Request: `{ operationId, origin, destination, stops }`. Cada lugar envía únicamente
`{ id, name, address, coordinate }`. Sin campos calculados. Respuestas:

- `status: priced`, `quote`: cotización autoritativa.
- `status: unpriced`, `reason: pricing_not_configured`, `routePreview`: ruta válida sin config.
- `status: unpriced`, `reason: pricing_unavailable`, `routePreview`: config inválida,
  región no clasificable o cálculo inseguro.
- `route_unavailable`: Routing falló; no se fabrica una ruta.
- HTTP 409 `idempotency_conflict`: mismo operationId con otro draft.

Store de proceso: hasta 500 operaciones, incluidas pendientes; índices por operationId
y quoteId, limpieza por TTL usando el intervalo existente del gateway. Peticiones
concurrentes iguales comparten la misma promesa Routing y snapshot. Un fallo no se
cachea y puede reintentarse. Una operación eliminada por TTL puede generar una nueva
cotización; el móvil utiliza un operationId nuevo para expiración/cambio/retry explícito
de un snapshot existente. Un retry tras fallo ambiguo conserva su operationId.
Reiniciar gateway borra todo; no hay DB, autenticación ni almacenamiento multiinstancia.

El móvil usa sólo `/quotes`, sin una segunda llamada a Routing. La unión priced/unpriced
vive en memoria/TanStack Query; no en SQLite ni SecureStore. No hace polling, ni cotiza
de nuevo por foreground o reconexión mientras el snapshot sea válido. Expiración usa
un timer con cleanup, muestra aviso, renueva y exige revisar otra vez. Cambios de
origen/destino/paradas y retry explícito también pueden crear una nueva quote.

La UI sólo presenta total (dos decimales), distancia y duración; si no hay precio,
mantiene el mapa y muestra precio no disponible. Gates independientes:
`pricingReady && paymentReady && tripRequestAvailable && online && !pending`.
Live mantiene pago y solicitud en false. Pricing nunca produce `paymentMethod`.
El gateway fixture mantiene sus valores sintéticos y matching únicamente DEV.

## Validación y pendientes

Tests sintéticos sólo en `tests/support/pricing-fixture.ts`; la marca
`SYNTHETIC_PRICING_TEST_ONLY` no debe entrar al bundle. Tests cubren fórmula, mínimo,
fracciones/redondeo/overflow, configuración externa inválida, selección/overrides,
concurrencia, TTL, conflictos, HTTP, stops y gates móviles.

Para precio real faltan tarifas aprobadas, límites municipales aprobados, versión,
overrides/adiciones que correspondan y la ruta externa configurada en el servidor.
Además se requiere acceso TomTom Routing. Payment y request/matching productivos
siguen pendientes incluso cuando una quote ya tiene precio.
