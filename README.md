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
- `smoke:legacy` comprueba que la home tenga tantas tarjetas como el catálogo y que la destacada sea la más reciente, y siempre juega `034-topologico`; no es QA de todos los juegos.

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
