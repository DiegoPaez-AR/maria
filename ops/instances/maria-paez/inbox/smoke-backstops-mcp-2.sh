#!/bin/bash
# Smoke #4+#5, toma 2: sin reload (ya está recargado), con retry de conexión.
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
TS=$(date +%s%3N)
call() { curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' -d "$1"; }
for i in 1 2 3; do
  R0=$(call "{\"usuarioId\":1,\"accion\":{\"tipo\":\"recordar_hecho\",\"clave\":\"_smoke_backstop\",\"valor\":\"tmp\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS,\"chatKey\":\"whatsapp:_smoke@c.us\"}")
  [ -n "$R0" ] && break; echo "intento $i: sin respuesta, espero 5s"; sleep 5
done
echo "1) recordar_hecho con chatKey → $R0"
R2=$(call "{\"usuarioId\":1,\"accion\":{\"tipo\":\"olvidar_hecho\",\"clave\":\"_smoke_backstop\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS}")
echo "2) olvidar_hecho sin chatKey (paridad gmail, sin guard) → $R2"
R3=$(call "{\"usuarioId\":1,\"accion\":{\"tipo\":\"accion_inexistente\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS,\"chatKey\":\"whatsapp:_smoke@c.us\"}")
echo "3) tipo inválido → $(echo "$R3" | head -c 200)"
echo "LISTO"
