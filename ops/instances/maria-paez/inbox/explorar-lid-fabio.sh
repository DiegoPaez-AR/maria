#!/bin/bash
set -uo pipefail
cd /root/secretaria
PORT="${ASISTENTE_INTERNAL_PORT:-4501}"
SECRET="${ASISTENTE_INTERNAL_SECRET:-}"
HDR=()
if [ -n "$SECRET" ]; then HDR=(-H "X-Intensa-Secret: $SECRET"); fi

# El LID que devolvió validate-wa para el número de Fabio
LID="102649869373553@lid"
echo "── /lid-info para $LID ──"
curl -sS -X POST -H "Content-Type: application/json" "${HDR[@]}" \
  -d "{\"lid\":\"${LID}\"}" \
  "http://127.0.0.1:${PORT}/lid-info" | python3 -m json.tool
