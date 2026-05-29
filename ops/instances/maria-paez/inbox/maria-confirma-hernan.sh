#!/bin/bash
# Maria le confirma a Hernan (user 2) que ya tiene acceso a su calendar.
# Via internal-api (cliente WA vivo) para que quede logueado en el hilo de Hernan.
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf
set -a; . "$cf"; set +a
PORT="${ASISTENTE_INTERNAL_PORT:-4501}"
SECRET="${ASISTENTE_INTERNAL_SECRET:-}"
TO="5491126829596"
MSG="Hernán, ya quedó: tengo acceso a tu calendar. Perdoná la vuelta con el mail de antes. Cualquier cosa que necesites coordinar, escribime."

echo "=== health ==="
curl -s "http://127.0.0.1:${PORT}/health" -H "X-Intensa-Secret: ${SECRET}"; echo
echo "=== POST /send-wa ==="
curl -s -X POST "http://127.0.0.1:${PORT}/send-wa" \
  -H "X-Intensa-Secret: ${SECRET}" -H "Content-Type: application/json" \
  -d "$(node -e 'console.log(JSON.stringify({to:process.argv[1],body:process.argv[2],usuarioId:2,nombre:"Hernan Fulco"}))' "$TO" "$MSG")"; echo
echo ""
echo "=== verif: ultimas lineas del hilo de Hernan ==="
sqlite3 -header -column "$MARIA_DB" "SELECT datetime(timestamp,'-3 hours') art, usuario_id uid, direccion, substr(cuerpo,1,55) FROM eventos WHERE de LIKE '%26829596%' ORDER BY id DESC LIMIT 3;"
