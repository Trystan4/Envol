#!/bin/sh
# Lance Envol sur http://localhost:8000 (rien n'est envoyé sur GitHub). Ctrl+C pour arrêter.
cd "$(dirname "$0")/.." || exit 1
command -v node >/dev/null || { echo "Il faut Node.js : https://nodejs.org"; exit 1; }
( sleep 1; (command -v open >/dev/null && open http://localhost:8000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:8000) ) >/dev/null 2>&1 &
exec node tools/serve.mjs 8000
