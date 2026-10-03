# Vima — Handoff técnico final de Visual System v1 + Motion System v1

**Destino:** 01 — Prompts para Codex  
**Estado:** **LISTO PARA CODEX** en P0, con dos excepciones explícitas: tema oscuro exacto y assets master de producción.

## Regla de autoridad

Los mockups aprobados son referencia visual, **no especificación funcional literal**. Codex no debe inferir nuevas tabs, servicios, reglas de pago, comportamientos ni copy funcional solo porque aparezcan en una imagen generada.

Orden de autoridad:
1. reglas funcionales cerradas;
2. este handoff;
3. arquitectura técnica vigente del repositorio;
4. assets master aprobados cuando existan.

---

## DECIDIDO — Identidad

- Marca de trabajo: **Vima**.
- Logo: fondo casi negro/carbón con trama de mapa sutil; V blanca + verde brillante; pin rojo.
- Wordmark: **Vima** en casi negro/carbón.
- Splash: carretera simplificada aprobada, **sin glow/luz verde añadida sobre la carretera**.
- Tema claro principal.
- Tema oscuro existe como parte de la identidad, pero sus tokens exactos aún no están cerrados.

---

## DECIDIDO — Paleta exacta

| Token | Hex | Uso |
|---|---|---|
| carbon | `#0B0F0E` | fondo oscuro / texto principal |
| graphite | `#2A2E2D` | texto secundario |
| gray | `#6B6F6E` | terciario |
| grayLight | `#D9DDDC` | bordes / disabled / superficies sutiles |
| background | `#F7F8F7` | fondo principal claro |
| white | `#FFFFFF` | contraste |
| green | `#00D68F` | acciones principales / éxito |
| greenDark | `#00826F` | estados activos / progreso |
| greenBright | `#2DFFB3` | highlight / motion |
| red | `#FF3830` | destino / pin / alerta crítica |
| blue | `#3B82F6` | comunicación / información |
| amber | `#F59E0B` | advertencia / espera |

**Regla:** rojo, azul y ámbar son semánticos, no decorativos.

### Gradiente principal
Horizontal:
- carbon `0%`
- greenDark `58%`
- greenBright `100%`

Uso restringido: logo, CTA seleccionados, momentos de éxito/hero y motion puntual. No convertir toda la UI en gradientes.

---

## DECIDIDO — Tipografía

Familia: **Inter**.

| Estilo | Tamaño | Peso |
|---|---:|---:|
| Display | 32–36 px | 700 |
| H1 | 28 px | 700 |
| H2 | 24 px | 600 |
| H3 | 20 px | 600 |
| Body | 16 px | 400–500 |
| Body small | 14 px | 400 |
| Caption | 12 px | 400 |

---

## DECIDIDO — Spacing, radios, bordes, elevación

### Spacing
Escala: `4, 8, 12, 16, 20, 24, 32, 40, 48 px`  
Margen horizontal móvil base: `20 px`

### Radios
- small: `8 px`
- field: `12 px`
- card: `16 px`
- sheet: `28 px`
- pill: `999 px`

### Bordes
- estándar: `1 px`
- color: `#D9DDDC`

### Elevación
- level0: plano
- level1: `y 2 / blur 8 / opacity 6%`
- level2: `y 8 / blur 24 / opacity 10%`

Codex puede mapear estos valores a iOS/Android sin alterar la intención visual.

---

## DECIDIDO — Tamaños base de componentes

- botón principal: `56 px` alto, pill;
- input principal: `52 px` alto;
- iconos canónicos: `16 / 20 / 24 px`;
- bottom-sheet snaps base: `24% / 52% / 88%`.

### Botón principal
- forma píldora;
- texto blanco;
- color plano o gradiente Vima cuando corresponda;
- loading conserva anchura/altura/posición.

### Inputs
- fondo gris muy claro;
- borde casi invisible;
- origen verde;
- destino rojo.

### Cards
- no convertir toda la UI en cards;
- fondo blanco/gris tenue;
- sombra contenida.

### Sheets
- superficie principal contextual sobre mapa;
- compacta/media/expandida;
- handle discreto;
- drag sigue al dedo.

---

## DECIDIDO — Iconografía y color semántico

- estilo lineal limpio;
- extremos suavizados;
- peso consistente;
- carbón por defecto;
- verde: ubicación/activo/éxito;
- rojo: destino/crítico;
- azul: llamada/mensaje/información;
- ámbar: espera/advertencia.

**Aún no definido:** librería final y stroke-width exacto. Codex no debe mezclar familias arbitrarias.

---

## DECIDIDO — Mapa

- mapa es superficie protagonista;
- poco ruido;
- POI secundarios atenuados;
- origen verde;
- destino rojo;
- usuario con punto + halo;
- ruta activa carbón o verde profundo según contexto;
- ruta completada gris;
- marker de vehículo simple y orientado;
- interpolación suave de posición/heading;
- no usar coches fotorrealistas como marker operativo;
- no simular conductores ficticios.

**Aún no definido:** style JSON final del mapa y line widths/opacities dependientes de zoom.

---

## DECIDIDO — Jerarquía y alineación

- peso visual general al centro en pantallas focales;
- títulos/estados principales centrados;
- listas/formularios pueden alinear contenido internamente según legibilidad;
- conductor asignado/en camino: título arriba, mapa arriba, información abajo;
- el pasajero **no acepta al conductor**;
- el PIN aparece desde la asignación;
- pasajero no tiene CTA “Iniciar viaje”;
- no inventar “Finalizar viaje” para pasajero.

---

# Motion System v1 — DECIDIDO

## Tokens de duración

| Token | ms |
|---|---:|
| instant | 120 |
| fast | 160 |
| normal | 240 |
| surface | 300 |
| map | 420 |
| success | 480 |
| searchCycle | 1900 |
| ambient | 9000 |

## Easings
- enter: `cubic-bezier(0.16, 1, 0.3, 1)`
- state: `cubic-bezier(0.4, 0, 0.2, 1)`
- exit: `cubic-bezier(0.4, 0, 1, 1)`

## Stagger
- `24 ms` cuando aplique.

## Spring
No usar spring genérico como comportamiento visual.  
Usar timings/easings aprobados por defecto.  
Spring físico solo para drag/snap si la arquitectura lo requiere; **no inventar stiffness/damping/mass creativos**.

## Microinteracción
- botón: `scale 1 → .98 → 1`
- error input: shake máx. `3 px`
- push pantalla: `translateX(16 px) + opacity`
- search pulse: `scale .65 → 1.35`, opacity `.45 → 0`
- máximo 2 anillos
- pin enter: `translateY(-6 px) → 0`

---

## DECIDIDO — Motion específico

### Botones
- tap 120–160 ms
- haptic light
- loading sin cambiar layout

### Inputs
- focus 160 ms
- error shake ≤3 px
- success breve

### Navegación
- `translateX(16 px) + opacity`, 240 ms

### Sheets
- entrada 300 ms
- cierre 240 ms
- drag 1:1 con dedo
- snap sin rebote marcado

### Mapa
- halo ubicación 1.8–2.0 s
- conductor: posición/heading interpolados
- ruta inicial: 420 ms como token base
- ruta recorrida pasa gradualmente a neutro

### Buscar conductor
- search cycle 1900 ms
- máximo 2 anillos
- expansión visual 420 ms
- vehículos reales se actualizan suavemente

### Match
- búsqueda → conductor en camino: usar `success=480 ms`
- detener pulso
- mostrar marker asignado
- dibujar ruta conductor→origen
- transformar sheet
- success haptic
- sin confirmación del pasajero

### Viaje
- inicia tras PIN validado por conductor
- vida visual principal: ruta, ETA y vehículo real
- sin loops decorativos

### Parada/espera
- llegada 300 ms
- timer estable
- cobrable: ámbar + haptic light

### Cambio de ruta
- pendiente: propuesta diferenciada, ruta vigente se conserva
- aprobado: 420–480 ms + success
- rechazado: volver a ruta original; sin dramatismo

### Viaje completado
- check `.85 → 1`
- 480 ms
- halo breve
- success haptic
- sin confeti

### Rating/propina
- selección 160 ms
- light haptic opcional

### Offline
- preservar contexto
- banner “Sin conexión · Intentando reconectar”
- indicador de reconexión animado
- al volver: mensaje de restablecimiento y fade posterior

### Seguridad
- check-in focal y calmado
- “Estoy bien”: check y retorno
- “Necesito ayuda”: transición inmediata
- emergencia puede usar rojo dominante sin flash global

---

## DECIDIDO — Haptics

| Evento | Haptic |
|---|---|
| botón/chip | light |
| toggle | light |
| solicitar viaje | medium |
| conductor encontrado | success |
| conductor llegó | medium |
| PIN correcto | success |
| PIN incorrecto | error |
| cambio aprobado | success |
| cambio rechazado | medium |
| viaje completado | success |
| pago correcto | success |
| pago fallido | error |
| alerta de seguridad | warning |

---

## DECIDIDO — Reduced Motion

Obligatorio respetar preferencia del sistema:
- navegación por fade;
- ambient gradient desactivado;
- loops decorativos desactivados;
- búsqueda → indicador estático/opacity suave;
- ruta → fade en vez de draw;
- evitar scales grandes;
- nunca eliminar información.

---

# AÚN NO DEFINIDO — no inventar

1. **Tema oscuro exacto**
   - surface tokens;
   - elevated surface;
   - text secondary;
   - borders;
   - mapa dark;
   - contraste final.

2. **Assets master de producción**
   - SVG master del símbolo;
   - wordmark vectorial;
   - app icon master;
   - variantes monocromáticas;
   - splash asset master.

3. **Mapa**
   - style JSON final;
   - line widths/opacities por zoom.

4. **Iconografía**
   - librería definitiva;
   - stroke exacto.

5. **Detalles menores**
   - paddings/min-widths específicos que no estén ya fijados por los tokens anteriores.

---

# Instrucción para Codex

Codex puede:
- importar estos tokens;
- construir/ajustar componentes;
- implementar motion y haptics;
- trasladar pantallas P0 aprobadas;
- respetar Reduced Motion;
- preparar el tema oscuro estructuralmente.

Codex **no puede**:
- inventar valores visuales faltantes;
- crear una nueva dirección de diseño;
- reinterpretar mockups como reglas funcionales;
- extraer un asset final recortando screenshots;
- decidir por su cuenta el tema oscuro final;
- cambiar flujos funcionales aprobados.

Con este documento, Visual System v1 + Motion System v1 queda **listo para 01 — Prompts para Codex**.

## Adenda aprobada — 2026-10-03: acento secundario P0

El encargo posterior aprueba `accentBlue` (#2F80FF), `accentBluePressed` (#1E6FE8),
`accentBlueSoft` (#EAF3FF) y halo derivado. El JSON incorpora la paleta; el halo usa 16%.
La ruta principal del pasajero pasa a azul con casing blanco, conservando geometría y motion.
Azul también identifica ubicación actual, controles activos, foco secundario e información.
Verde sigue siendo CTA/negocio/origen/éxito; rojo destino y estados críticos.

La ronda autoriza refinar iconografía y superficies visibles P0, sin modificar layouts ni flujos.
La implementación reutiliza Material Symbols regular a 24 dp desde su fuente local ya presente;
los assets de marca aprobados permanecen intactos. Los pendientes históricos de iconografía
no impiden este acabado acotado, ni equivalen a aprobar un nuevo master de marca.

## Referencia UI/UX posterior — 2026-10-03

La dirección principal de acabado para Passenger P0 pasa a la [referencia luminosa](PASSENGER_VISUAL_DIRECTION_2026-10-03.md),
excluyendo su branding. Las reglas de identidad/semántica Vima y Reduced Motion siguen vigentes.
Los detalles de superficies y amplitudes decorativas P0 se recogen en esa adenda; no cambian
la lógica, los contratos ni los assets aprobados.
