# Procedencia: juegos importados de diug22/Mierdijuegos (2023)

Seis juegos del Mierdijuegos original (repo `https://github.com/diug22/Mierdijuegos`, snapshot
`b6e551dea8f9354afd6e5178f89b6d1dd20f283f`, 2023-03-23T13:02:07+01:00) se incorporan al catálogo
actual como **archivo histórico**, no como juegos nocturnos nuevos. Datos legibles por máquina:
`manifest.json` (misma carpeta), que usan los tests `test/import-2023*.test.mjs`.

## Regla de fecha

`date` = día en **Europe/Madrid** (zona del sitio) de la **fecha de autor del primer commit que añade
el juego**, siguiendo su cadena de rutas. Ni la fecha de última modificación ni la de migración
(2026-10-24). En los seis, UTC y Madrid dan el mismo día; el más justo es ZigZag (22:26 UTC = 23:26 en
Madrid, CET, antes del cambio de hora del 26 de marzo).

Los IDs 038–043 siguen el orden de esa primera introducción (fecha y hora completas: los tres del
2023-03-19 se ordenan por hora).

## Evidencia por juego

| ID destino | Juego fuente (`fileList.json`) | Commit de evidencia | Ruta añadida | Fecha de autor (git `%aI`) | Fecha |
|---|---|---|---|---|---|
| `038-zigzag-salto` | `zig_zag_salto` «ZigZagSalto» 7/10⭐ | `a360432c8b0741aea50e18e71e4b71c3bb3c176e` «Create zig_zag_salto.html» | `zig_zag_salto.html` | `2023-03-18T22:26:19Z` | 2023-03-18 |
| `039-cazador-de-estrellas` | `cazador_estrellas` «Cazador de estrellas» 5/10⭐ | `a2de361701ead880435d508ef30f4ad9ba8f474b` «Create cazador_estrellas.html» | `cazador_estrellas.html` | `2023-03-19T09:02:30Z` | 2023-03-19 |
| `040-conexion-cuantica` | `conexion_cuantica` «Conexión cuántica» 2/10⭐ | `743c8b367715c9d1d0d71db71449044181589e43` «Create conexiom_cuantica.html» | `conexiom_cuantica.html` | `2023-03-19T11:08:01Z` | 2023-03-19 |
| `041-colorblitz` | `colorblitz` «ColorBlitz» 8/10⭐ | `edd0f54f61eb3d39c96b0b246ebeda5b41f2fddf` «Create colorblitz.html» | `colorblitz.html` | `2023-03-19T12:42:47Z` | 2023-03-19 |
| `042-wave-river` | `wave_river` «Wave River» 2/10⭐ | `398ee1818ec08a769e0334ecbb28ed5eafba9237` «wafe river» | `juegos/wave_river/wave_river.js` | `2023-03-21T14:53:32+01:00` | 2023-03-21 |
| `043-sound-scape` | `sound_scape` «Sound Scape» 9/10⭐ | `03b26159fde64d8364497ceaa3f8d450440ac1ff` «sound scape» | `juegos/sound_scape/sound_scape.js` | `2023-03-21T22:51:02+01:00` | 2023-03-21 |

### Cadena de rutas (los cuatro primeros)

Los cuatro primeros nacieron como HTML sueltos en la raíz y llegaron al `.js` final así:

1. `58edc5176bbaf70dc9f0c474d47c1a5d1b444656` «Reestructuracion»: renombrado exacto (R100) a `src/<juego>/…html`
   (ZigZag: `src/zig_zag_salto.html/zig_zag_salto.html`).
2. `bf5d46c3583f5b8ee3f5345c2e83c060c20df6c4` «Change name of directory»: R100 a `juegos/<juego>/index.html`.
3. `f67e2a43145a2d578782744fd4efe82c6b2e55f2` «modules load»: el `<script>` inline se extrae a
   `juegos/<juego>/<juego>.js` dentro de `function initGame(){…}`. Comparando sin espacios, líneas vacías
   ni llaves sueltas, la lógica es **idéntica** a la del primer commit.

Conexión cuántica tiene un paso más al principio: `0306d754fc9a36e901d32923592fdf8ed32d5106` renombra
(R100) `conexiom_cuantica.html` → `conexion_cuantica.html` 18 s después de crearlo.

Wave River y Sound Scape se crearon ya en su carpeta final: el commit de evidencia añade a la vez
`index.html` y el `.js`, y la carpeta no aparece en ningún commit anterior.

### Aviso: `git log --follow` sobre `index.html` da fechas falsas

Los `juegos/<juego>/index.html` de la época son stubs casi idénticos (solo `<style>` y `<title>`), y la
heurística de renombrados de `--follow` los empalma con otros juegos:
`git log --follow -- juegos/wave_river/index.html` acaba en `a2de361` (Cazador, 2023-03-19) y el de
`sound_scape` en `743c8b3` (Conexión, 2023-03-19). Por eso la cadena es explícita y los tests la
comprueban paso a paso (R100 en cada commit, lógica idéntica en la extracción, nada anterior).

### Cómo se verifica

`test/import-2023.test.mjs`, si existe el snapshot en `.local/import-source` (no versionado; en un clon
limpio esos tests se saltan con un mensaje explícito): HEAD = commit fuente; `fileList.json` con seis
visibles y `boucing_bots` oculto; fecha y asunto de cada commit; que añade la ruta; cada renombrado R100;
la extracción con lógica idéntica; que ninguna ruta de la cadena aparece antes; y el fallo de `--follow`.

## Excluido: `boucing_bots`

`9f5cd66c04e82db9a064180ed5455082e464bd85` (2023-03-22). Está `is_visible: false` en `fileList.json` y sin
terminar: un robot que rebota sin objetivo, puntuación ni fin; el bucle está anidado dentro de otra
función `gameLoop`; solo responde a la barra espaciadora (nada en móvil); reutiliza el GIF de Wave
River y el `<title>` «SoundScape». Importarlo obligaría a inventar el juego entero.

## Adaptación (qué se conserva y qué cambia)

Común a los seis: un HTML autocontenido con el contrato actual (`validateNewGameHtml`): fondo
`#0a0a0a`, neones, español, pantalla de instrucciones con JUGAR, fin real con resultado, REINTENTAR,
`← MÁS MIERDIJUEGOS`, Pointer Events (dedo y ratón), `/ranking.js` con `reset()` al empezar y un
`fin(puntos)` en el fin real (la analítica la añade `ranking.js` solo en producción). Sin assets
externos. Los originales avanzaban un tick por frame; aquí el tick es fijo de 1/60 s, que equivale al
original en una pantalla de 60 Hz y no se acelera en pantallas de 120 Hz. Las constantes (velocidades,
tamaños, probabilidades por tick, puntos) son las originales en píxeles CSS.

- **038 ZigZag Salto** — igual. Puntuación original (incluido el +1 por tick por cada barra ya por
  debajo de la bola). La bola se recoloca dentro de la pared al rebotar (en el original podía quedarse
  vibrando fuera si tocabas justo en el borde).
- **039 Cazador de Estrellas** — igual (paso de 50 px hacia el lado del toque, +10 por estrella).
  Se borra lo que sale de pantalla (el original llamaba a `filter` sin asignar el resultado).
- **040 Conexión Cuántica** — misma regla (unir las 10 parejas de 5 qubits; al completar, otra red).
  El original no tenía puntos ni derrota («Ganaste!» y otra red), así que el ranking sería inventado
  sin un límite: la sesión dura **60 s** y la puntuación son las **conexiones válidas** (10 por red).
  Radio de agarre 30 px (original 20, pensado para ratón) y qubits separados ≥ 70 px.
- **041 ColorBlitz** — igual (10 s, +1 s y rejilla +1 por acierto hasta 8×8, fallo = fin; puntos =
  aciertos). Tablero cuadrado bajo el marcador. El color base se limita a 10–215 por canal: con bases
  claras la casilla distinta (+30) se saturaba a 255 y era imposible de distinguir.
- **042 Wave River** — igual (toque: `x += (dedo − x) · 0,1`; monedas +1 durante 300 ticks; obstáculo
  = fin). Arreglos: los obstáculos ahora sí caducan a los 300 ticks (el original declaraba `life` pero
  no lo descontaba y se acumulaban); parpadean **60 ticks (1 s)** antes de ser sólidos (en el original podían
  nacer encima del surfista y matarlo sin aviso); la ola tiene 11 puntos de borde a borde (el último
  tramo leía un punto inexistente → `NaN`); la inclinación del surfista usa la pendiente real.
- **043 Sound Scape** — mismo laberinto (DFS con pila, celdas `⌊tamaño/80⌋·2+1`, salida en (0,1)),
  jugador **invisible**, misma nota (seno de 0,5 s con la misma envolvente, escala cromática de 36 notas
  indexada por la longitud del camino A* hasta la salida) y mismo control por deslizamiento. Web Audio
  real: el `AudioContext` se crea con el gesto de JUGAR; botón 🔊/🔇 para silenciar. El original no
  tenía puntos ni reinicio («Ganaste!» y se quedaba ahí): sesión de **180 s**, un punto por salida y
  otro laberinto. Un toque corto (< 24 px) solo escucha (en el original un toque contaba como
  deslizar hacia arriba y te movía). El inicio se elige entre celdas con camino de 11–49 pasos (el
  original medía 10–50 en línea recta desde la esquina opuesta a la salida, que en un móvil dejaba al
  jugador casi en la salida).

## Ranking

Los seis son «más es mejor» (orden por defecto de la RPC, sin tocarla). Semilla aditiva:
`supabase/migrations/20261024150000_seed_juegos_importados_2023.sql` (`insert … on conflict (id_juego) do
nothing`, solo los seis ids). Hasta que una persona la aplique en Supabase, sus paneles dirán «ranking
no disponible».

## Límites

- La fecha prueba cuándo entró el juego en ese repo, no cuándo se escribió ni quién lo generó (el
  original decía «Juegos creados con GPT4»).
- Las sesiones de 60 s (040) y 180 s (043) son una decisión de esta adaptación, no del original.
- Los tests no prueban que los juegos sean divertidos; Sound Scape se termina forzando su `endGame()`
  real en el test porque la sesión dura 3 minutos.
