#!/bin/bash
set -uo pipefail
PORT="${ASISTENTE_INTERNAL_PORT:-4501}"
SECRET="${ASISTENTE_INTERNAL_SECRET:-}"
HDR=()
if [ -n "$SECRET" ]; then HDR=(-H "X-Intensa-Secret: $SECRET"); fi

# Re-aplica el mismo wa_cus a Santi via endpoint nuevo (idempotente).
# Esto fuerza que el proceso pm2 ejecute el UPDATE en su misma conexión SQLite,
# evitando el WAL stale read.
echo "── POST /update-usuario { id:13, wa_cus:'5491166010010@c.us' } ──"
curl -sS -X POST -H "Content-Type: application/json" "${HDR[@]}" \
  -d '{"id":13,"wa_cus":"5491166010010@c.us"}' \
  "http://127.0.0.1:${PORT}/update-usuario" | python3 -m json.tool
