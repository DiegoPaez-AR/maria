#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/smoke-accion-2a2.out"
{
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1; echo "reload exit=$?"
PORT="${ASISTENTE_INTERNAL_PORT:?}"; SECRET="${ASISTENTE_INTERNAL_SECRET:?}"
for i in $(seq 1 20); do H=$(curl -s -m 3 -H "X-Intensa-Secret: $SECRET" "http://127.0.0.1:$PORT/health"); echo "$H" | grep -q '"ok":true' && { echo "health OK ($i)"; break; }; sleep 2; done
echo "=== TEST 4b: nombre inventado -> ok:false rapido (sin repair) ==="
time curl -s -m 8 -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" -d '{"usuarioId":1,"accion":{"tipo":"guardar_cosa_inexistente"}}'; echo
echo "=== TEST re-check: crear_evento sin campos ==="
curl -s -m 8 -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" -d '{"usuarioId":1,"accion":{"tipo":"crear_evento"}}'; echo
} > "$OUT" 2>&1
echo done >> "$OUT"
