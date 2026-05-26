#!/bin/bash
set -uo pipefail
cd /root/secretaria
PORT="${ASISTENTE_INTERNAL_PORT:-4501}"
SECRET="${ASISTENTE_INTERNAL_SECRET:-}"
HDR=()
if [ -n "$SECRET" ]; then HDR=(-H "X-Intensa-Secret: $SECRET"); fi

echo "── post-fix: validate-wa del nro de Fabio ──"
curl -sS -X POST -H "Content-Type: application/json" "${HDR[@]}" \
  -d '{"wa":"5493492580906"}' \
  "http://127.0.0.1:${PORT}/validate-wa" | python3 -m json.tool
