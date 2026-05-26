#!/bin/bash
set -uo pipefail
PORT="${ASISTENTE_INTERNAL_PORT:-4501}"
SECRET="${ASISTENTE_INTERNAL_SECRET:-}"
HDR=()
if [ -n "$SECRET" ]; then HDR=(-H "X-Intensa-Secret: $SECRET"); fi

echo "── POST /reload-usuarios ──"
curl -sS -X POST -H "Content-Type: application/json" "${HDR[@]}" \
  -d '{}' \
  "http://127.0.0.1:${PORT}/reload-usuarios" | python3 -m json.tool
