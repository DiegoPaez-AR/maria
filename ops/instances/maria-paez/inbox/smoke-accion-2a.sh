#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/smoke-accion-2a.out"
{
echo "=== reload para cargar /accion + turn-state ==="
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env; echo "exit=$?"
PORT="${ASISTENTE_INTERNAL_PORT:?}"; SECRET="${ASISTENTE_INTERNAL_SECRET:?}"
echo "PORT=$PORT"
echo "=== esperar /health ==="
for i in $(seq 1 20); do
  H=$(curl -s -m 3 -H "X-Intensa-Secret: $SECRET" "http://127.0.0.1:$PORT/health")
  if echo "$H" | grep -q '"ok":true'; then echo "health OK ($i): $H"; break; fi
  sleep 2
done
echo
echo "=== TEST 1: accion invalida (crear_evento sin campos) -> ok:false con error del executor ==="
curl -s -m 8 -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"usuarioId":1,"accion":{"tipo":"crear_evento"}}'; echo
echo
echo "=== TEST 2: accion valida inofensiva (recordar_hecho) -> ok:true ==="
curl -s -m 8 -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"usuarioId":1,"accion":{"tipo":"recordar_hecho","clave":"_smoke_mcp_2a","valor":"ok","fuente":"smoke"}}'; echo
echo
echo "=== TEST 3: limpiar el hecho de prueba (olvidar_hecho) ==="
curl -s -m 8 -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"usuarioId":1,"accion":{"tipo":"olvidar_hecho","clave":"_smoke_mcp_2a"}}'; echo
echo
echo "=== TEST 4: tipo inventado -> ok:false Accion desconocida ==="
curl -s -m 8 -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"usuarioId":1,"accion":{"tipo":"guardar_cosa_inexistente"}}'; echo
echo
echo "=== TEST 5: usuarioId inexistente -> 404 ==="
curl -s -m 8 -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"usuarioId":99999,"accion":{"tipo":"recordar_hecho","clave":"x","valor":"y"}}'; echo
} > "$OUT" 2>&1
echo done >> "$OUT"
