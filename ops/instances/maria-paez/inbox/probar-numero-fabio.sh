#!/bin/bash
set -uo pipefail
cd /root/secretaria
PORT="${ASISTENTE_INTERNAL_PORT:-4501}"
SECRET="${ASISTENTE_INTERNAL_SECRET:-}"
HDR=()
if [ -n "$SECRET" ]; then HDR=(-H "X-Intensa-Secret: $SECRET"); fi

echo "── PORT=$PORT, secret set: $([ -n "$SECRET" ] && echo si || echo no) ──"

for NUM in "5493492580906" "543492580906" "5491152189302"; do
  echo
  echo "── ${NUM} ──"
  curl -sS -X POST -H "Content-Type: application/json" "${HDR[@]}" \
    -d "{\"wa\":\"${NUM}\"}" \
    "http://127.0.0.1:${PORT}/validate-wa" | python3 -m json.tool 2>/dev/null || echo "(parse falló)"
done
