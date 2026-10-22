# CLAUDE.md — Mierdijuegos

Sitio Astro con un juego HTML nuevo cada noche. Detalle completo en `README.md`.

## Comandos

- `npm ci` · `npx playwright install chromium`
- `npm test` — tests con fixtures TEST-ONLY (generador falso, sin LLM).
- `npm run build` · `npm run smoke:legacy` (home compilada + `034-topologico`; requiere build).
- `npm run preflight` — comprueba herramientas/credenciales, tests y build. No genera.
- `npm run nightly` — solo local: genera y valida un juego con Claude real. No despliega.
- `npm run nightly -- --publish` — **deploy real a producción y git push**. No ejecutar sin permiso explícito.
- `npm run publish -- NNN-slug --yes` — reintento explícito; también es deploy real + push.

## Reglas

- Juegos: cualquier tema, mecánica distinta del catálogo; mantener la marca (`#0a0a0a`, neones, español, tono juguetón). Contrato del generador en `scripts/generate-game.md`.
- `.local/ready.json` con `status: "ready"` de otra fecha bloquea generar otro juego; solo un `publishGame` completo lo pasa a `published`. Fallos parciales lo dejan en `ready`; mira `.local/publish-result.json` y reintenta con `npm run publish`.
- Fallo por cuota de Claude = no se crea juego.
- Lock `.local/nightly.lock` fail-closed: nunca borrarlo sin comprobar que su `pid` ya no existe.
- `.local/` (logs, runs, estado) está ignorado por git.
- El smoke fuerza el game-over con `mierdiTest.forceGameOver`; no prueba que el juego sea ganable ni divertido.
- `scripts/nightly-cron.sh` es para un cron de Hermes futuro: no instalarlo ni crear el cron sin que se pida. No tocar la config global.
