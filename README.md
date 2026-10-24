# Mierdijuegos

Un mierdijuego nuevo cada noche en [mierdijuegos.com](https://mierdijuegos.com): sitio Astro estático, juegos HTML autocontenidos en `public/games/NNN-slug/index.html` y catálogo en `public/games/games.json`.

Los juegos pueden ser de cualquier tema; lo que tiene que cambiar es la mecánica (controles, reglas, feedback o victoria/derrota). Se mantiene la marca: fondo `#0a0a0a`, neones, español y tono juguetón. Las reglas para el generador están en `scripts/generate-game.md`.

## Comandos

```sh
npm ci                             # dependencias exactas
npx playwright install chromium    # navegador para tests y smoke
npm test                           # tests (fixtures TEST-ONLY, sin LLM)
npm run build                      # build de Astro en dist/
npm run smoke:legacy               # smoke de la home compilada + 034-topologico (requiere build)
npm run preflight                  # comprueba claude/gh/vercel/origin, tests y build; no genera nada
npm run nightly                    # SOLO local: genera, valida y añade un juego; no despliega ni hace push
npm run nightly -- --publish       # REAL: lo anterior + deploy a producción en Vercel + git push
npm run publish -- NNN-slug --yes  # reintento explícito de publicar un juego pendiente
```

## Cómo funciona `nightly`

1. Toma el lock `.local/nightly.lock` y valida el catálogo.
2. Si ya hay juego con la fecha de hoy (Europe/Madrid) → `already-exists`, sin hacer nada (con `--publish` tampoco publica).
3. Si `.local/ready.json` tiene `status: "ready"` de otra fecha → **falla**: hay un juego validado sin publicar. Publícalo con `npm run publish -- NNN-slug --yes` antes de generar otro.
4. Llama a Claude real (`claude -p`, modelo `MIERDI_MODEL` o `opus`), valida el HTML y la novedad, hace smoke en Chromium y build en una copia en `.local/runs/<stamp>/`.
5. Solo si todo pasa, añade el juego y el catálogo de forma atómica y escribe `.local/ready.json` (`status: "ready"`).

`publishGame` revalida (hashes, tests, smoke, build), hace commit solo de esos dos ficheros, despliega con `vercel deploy --prod`, comprueba el HTML en la URL de Vercel y en mierdijuegos.com, hace push y verifica el commit remoto. Solo entonces marca `ready.json` como `published`.
La URL `*.vercel.app` está protegida por SSO, así que se lee con el CLI autenticado (`vercel curl --deployment`, sin desactivar la protección) y mierdijuegos.com con un fetch público; `npm run verify:published` repite ambas comprobaciones y el commit remoto sin desplegar y guarda `.local/deploy-verification.json`.

## Fallos y recuperación

- **Cuota/límite de Claude**: el run falla y **no se crea ningún juego**; el catálogo no se toca. Se reintenta en la siguiente ejecución.
- **Respuesta genuina rechazada por error** (p. ej. falso "límite"): `npm run nightly -- --resume <RUN_STAMP>` reutiliza `.local/runs/<RUN_STAMP>/claude.raw.log` sin volver a llamar a Claude, solo si su `prompt.txt` es idéntico al prompt que se enviaría hoy; valida, hace smoke y build como un run normal (añade `--publish` para desplegar).
- **Publicación parcial** (deploy, readback o push fallidos): `ready.json` sigue en `ready`. El diario `.local/publish-result.json` registra hasta dónde llegó (`validating`, `committed`, `deployed-unverified`, `deployed-verified`, `published`), commit y URL. Revisa ese estado y reintenta con `npm run publish -- NNN-slug --yes`.
- **Lock** (`another run holds the lock`): es fail-closed y nunca se roba solo. Lee `.local/nightly.lock`, comprueba que su `pid` no está vivo (`ps -p <pid>`) y solo entonces bórralo a mano.
- Logs y estado (`.local/`) están en `.gitignore`: son locales y no se suben.

## Limitaciones de las pruebas

- `npm test` usa un juego fixture marcado TEST-ONLY y un generador falso; **no** prueba la generación con el LLM real. Solo `npm run nightly` la ejerce.
- El smoke pulsa JUGAR, toca/arrastra, fuerza el fin con `window.mierdiTest.forceGameOver()` y pulsa REINTENTAR. Que el game-over sea forzado significa que no demuestra que se pueda ganar o perder jugando, ni que sea divertido.
- El smoke de juegos nuevos sirve `/ranking.js` desde el mismo origen y responde a Supabase con un mock (GET vacío y RPC que devuelve la entrada): comprueba que el fin abre el ranking, que la RPC recibe `mierdiTest.score()` y que tras REINTENTAR otro fin lo vuelve a abrir. No escribe en ninguna base de datos.
- `smoke:legacy` comprueba que la home tenga tantas tarjetas como el catálogo y que la destacada sea la más reciente, y siempre juega `034-topologico`; no es QA de todos los juegos.

## Ranking arcade (top 5 por juego)

Cada juego tiene un top 5 sin cuentas: al terminar una partida se abre un panel retro con el top 5 y, solo si el resultado entra, se piden 3 iniciales A-Z. No guarda historial ni datos personales.

- **Cliente**: `public/ranking.js` (vanilla, sin dependencias, Shadow DOM). Los juegos solo añaden `<script src="/ranking.js" defer></script>`, `window.mierdiRanking?.reset()` al empezar/reintentar y una llamada `window.mierdiRanking?.fin(resultado)` en el fin real. Solo cuenta el primer `fin()` de cada partida (los fines duplicados se ignoran hasta el siguiente `reset()`); peticiones con `AbortController` y timeout de 8 s; las respuestas de una partida anterior se descartan; si el envío falla o no llega respuesta, "REINTENTAR ENVÍO" repite exactamente el mismo payload. El panel para la propagación de sus eventos (014 escucha teclas, 031 reinicia con un clic en document), no enfoca el input (en móvil no salta el teclado solo), se cierra con CERRAR/Escape y no bloquea el reintento del juego. Si Supabase no responde, el juego sigue igual.
- **Configuración** (en `ranking.js`): URL `https://grldrwbiovglfxqjdicv.supabase.co` y la clave **publishable** (`sb_publishable_…`, se envía solo en la cabecera `apikey`). Es pública por diseño y equivale al rol `anon`; **nunca** pongas aquí la `service_role` ni una clave secreta.
- **Esquema** (`supabase/migrations/20261024120000_mierdi_ranking.sql`): `public.mierdi_ranking(id_juego text primary key, ranking jsonb not null default '[]')`, con `ranking` = array de como mucho 5 `{siglas, resultado}`. RLS activado; `anon`/`authenticated` solo tienen `SELECT`. La única escritura es la RPC `public.mierdi_enviar_resultado(p_id_juego, p_siglas, p_resultado)`: `SECURITY DEFINER`, `search_path` vacío, tabla cualificada, `EXECUTE` revocado a `PUBLIC`/`anon`/`authenticated` y concedido solo a `anon`/`authenticated`. Valida siglas `^[A-Z]{3}$`, resultado no nulo, finito, entre 0 y 1e9 (redondeado a 2 decimales); bloquea la fila con `SELECT … FOR UPDATE`, ignora un reenvío idéntico (mismas siglas y resultado), mezcla, ordena (empate: gana quien llegó antes) y recorta a 5. **Orden**: todos "más es mejor" salvo `030-brachistocrona` (tiempo, menos es mejor, > 0, y solo se envía cuando la bola llega a la meta); está fijado en la RPC y en `ranking.js`. 024 envía los puntos (`score`), no los túneles.
- **Solo juegos sembrados**: la RPC no crea filas; un id sin fila se rechaza y el panel dice "ranking no disponible". La migración siembra los 37 juegos actuales con `[]`.
- **Aplicar la migración**: la revisa y aplica una persona en Supabase (SQL editor o `supabase db push`); este repo no la aplica ni tiene credenciales de administrador. Estado: aplicada a mano en el proyecto de producción el 2026-10-24 (37 filas sembradas, vacías). Tests SQL rollback-only en `supabase/tests/mierdi_ranking.test.sql` (ejecútalos tras la migración en una rama, o en local con PGlite: `npm install --no-save --prefix .local/pglite @electric-sql/pglite@0.3 && node --test supabase/tests/pglite.test.mjs`).

### Paso humano para cada juego nuevo (obligatorio)

`npm run nightly` deja `.local/runs/<stamp>/ranking-seed.sql` (y `publish` lo repite en `rankingSeed` de su salida/`.local/publish-result.json`) con
`insert into public.mierdi_ranking (id_juego) values ('NNN-slug') on conflict (id_juego) do nothing;`
(plantilla: `supabase/seed-nuevo-juego.template.sql`). **Nadie lo ejecuta automáticamente**: ni `nightly`, ni `publish`, ni el cron. Ejecútalo a mano en Supabase (SQL editor) con un usuario administrador tras publicar. Hasta entonces el juego funciona pero su ranking aparece como no disponible. No se automatiza porque requeriría guardar credenciales privilegiadas en la máquina del cron.

### Límites honestos

- El resultado lo calcula el navegador: no hay antitrampas ni rate limit; cualquiera con la clave pública puede enviar cualquier resultado válido a un juego sembrado y llenar su top 5 (no puede tocar otras filas, otras tablas ni crear juegos). Arreglarlo requeriría validación en servidor por juego.
- La idempotencia es por (siglas, resultado): dos partidas distintas con las mismas iniciales y el mismo resultado cuentan una vez.
- Los tests de UI y de juegos usan Supabase **mockeado** en Chromium; el SQL se ha ejecutado en PGlite (Postgres 17 en WASM, sin PostgREST) y, tras aplicarlo, contra el proyecto real (permisos del rol `anon`, top 5/empates/orden asc/idempotencia/entradas inválidas con rollback y 10 envíos HTTP públicos concurrentes sobre una fila temporal ya borrada). Pendiente: probar el panel en un navegador real desde mierdijuegos.com (CORS de ese origen).
- `test/ranking-games.test.mjs` provoca el fin de cada juego llamando a su función terminal real (031: poniendo `health=0`; 030: bola en la meta) y pulsa sus botones reales; no demuestra que cada juego se pueda ganar o perder jugando. Para que el juego no termine solo entre el clic de JUGAR y el fin inyectado, el test congela `requestAnimationFrame` en esa ventana (los temporizadores siguen corriendo); 005 y 028 terminan de forma natural, con frames libres.

## Analítica (Vercel Web Analytics)

- **Qué mide**: solo las páginas vistas estándar de Vercel (URL, referrer, país/dispositivo agregados). Sin eventos propios ni Speed Insights; nunca siglas, resultados, peticiones a Supabase ni identificadores. `public/analytics.js` no crea cookies ni localStorage.
- **Cómo carga**: `public/analytics.js` (vanilla, ~15 líneas) prepara la cola `window.va` e inyecta una sola vez el script oficial same-origin `/_vercel/insights/script.js`. La home lo carga desde `Layout.astro` (`<script is:inline defer src="/analytics.js">`). Los juegos estáticos **no** llevan etiqueta propia: `public/ranking.js`, que todos incluyen, inyecta `/analytics.js` una vez antes del ranking, así que los juegos nuevos quedan cubiertos sin tocar su HTML (ni el validador ni el hash de `publish`).
- **Solo producción**: ambos cargadores actúan únicamente en `mierdijuegos.com` y `www.mierdijuegos.com`; en localhost, 127.0.0.1 (tests, smoke) y previews `*.vercel.app` no hacen nada. Si un bloqueador corta el script, el juego y el ranking siguen igual.
- **Tests**: `test/analytics.test.mjs` (Chromium, producción simulada con `route.fulfill` y script de Vercel mockeado; no sale telemetría). Pendiente tras el deploy: comprobar en mierdijuegos.com que `/_vercel/insights/script.js` responde 200 y que aparecen vistas en el panel de Vercel.

## Juegos importados de 2023 (038–043)

Los seis juegos visibles del Mierdijuegos original ([diug22/Mierdijuegos](https://github.com/diug22/Mierdijuegos), snapshot `b6e551d`) están en el catálogo como **archivo histórico**, no como juegos nocturnos: 038 ZigZag Salto (2023-03-18), 039 Cazador de Estrellas, 040 Conexión Cuántica, 041 ColorBlitz (2023-03-19), 042 Wave River y 043 Sound Scape (2023-03-21).

- **Procedencia**: `src/imports/diug22-mierdijuegos-2023/manifest.json` (repo/commit fuente, juego fuente, id destino, fecha original, commit y ruta de evidencia, cadena de renombrados) y `PROVENANCE.md` (razonamiento). Fecha = día Europe/Madrid del primer commit que añade el juego; ids por orden de esa introducción. Ojo: `git log --follow` sobre los `index.html` stub da fechas falsas para 042/043. Está bajo `src/` porque la portada lo importa y el staging de `nightly` solo copia `public/` y `src/`.
- **Excluido**: `boucing_bots` (oculto en la fuente y sin terminar).
- **Adaptación**: misma mecánica y constantes, interfaz actual (instrucciones, JUGAR, fin real, REINTENTAR, `/ranking.js`), tick fijo de 1/60 s y arreglos de bugs listados en `PROVENANCE.md`. 040 y 043 no tenían puntos ni final: se acotan a sesiones de 60 s / 180 s (puntos = conexiones / laberintos escapados). Sound Scape usa Web Audio creado con el gesto de JUGAR y tiene botón de silencio.
- **Portada**: ordena por fecha, así que salen al final del archivo con su fecha de 2023 y la etiqueta «📼 original de 2023»; 037 (o el último nocturno) sigue siendo el del día.
- **Ranking**: paso humano, aplicar `supabase/migrations/20261024150000_seed_juegos_importados_2023.sql` (solo inserta las seis filas vacías, `on conflict do nothing`; no toca puntuaciones, RLS ni la RPC). Hasta entonces su panel dice "ranking no disponible".
- **Tests**: `test/import-2023.test.mjs` (manifiesto, evidencia git si existe `.local/import-source`, 37 juegos previos byte a byte frente a `d23f1a9`, contrato HTML, orden por fecha, SQL) y `test/import-2023-browser.test.mjs` (Chromium móvil, Supabase **mockeado**: entrada real, fin natural salvo 043 y la 2.ª ronda de 040, ranking, reintento; portada compilada con Astro). No prueban que sean divertidos.

## Planificación (FUTURO, no instalada)

`scripts/nightly-cron.sh` fija `PATH`, `TZ=Europe/Madrid`, entra en el repo y ejecuta `npm run nightly -- --publish`. No contiene secretos. Cuando se haya validado una generación y un deploy reales:

```sh
cp scripts/nightly-cron.sh ~/.hermes/scripts/mierdijuegos-nightly.sh
chmod +x ~/.hermes/scripts/mierdijuegos-nightly.sh
hermes cron create '15 3 * * *' --name Mierdijuegos --script mierdijuegos-nightly.sh \
  --no-agent --workdir /Users/aeonhouse/projects/mierdijuegos --deliver local \
  --paused --paused-reason pending-real-generation-and-deploy
```

- El script instalado tiene un timeout de 3600 s.
- La zona horaria del planificador sale de `HERMES_TIMEZONE` o de la config de Hermes; si no, la hora local del servidor. El `TZ` del wrapper **no** cambia cuándo se dispara el cron.
- Se crea en pausa; reanudar es una decisión manual.
