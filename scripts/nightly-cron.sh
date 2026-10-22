#!/bin/sh
# Wrapper para un futuro cron de Hermes (NO instalado). Genera, valida y publica
# en producción (Vercel + git push). Sin secretos: usa las sesiones ya iniciadas
# de claude, gh y vercel del usuario.
# TZ solo afecta a este proceso; NO fija la zona horaria del planificador.
set -eu
export PATH="/Users/aeonhouse/.local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export TZ="Europe/Madrid"
cd /Users/aeonhouse/projects/mierdijuegos
exec npm run nightly -- --publish
