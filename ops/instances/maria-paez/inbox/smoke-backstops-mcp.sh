#!/bin/bash
# Smoke de #4+#5 post-reload. Usa node del proceso para simular el flujo /accion
# sin pasar por el LLM. NO imprime secretos.
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
echo "reload exit=$?"
sleep 5
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
OWNER_ID=1
TS=$(date +%s%3N)
# 1) acción inofensiva OK via /accion CON chatKey → debe ejecutar y acumular
R1=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":$OWNER_ID,\"accion\":{\"tipo\":\"recordar_hecho\",\"clave\":\"_smoke_backstop\",\"valor\":\"tmp\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS,\"chatKey\":\"whatsapp:_smoke@c.us\"}")
echo "1) accion ok: $(echo "$R1" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("ok"))')"
# 2) guard: registrar inbound POSTERIOR en el mismo chat → misma acción debe dar stale
node -e "require('/root/secretaria/turn-state.js').setLastInbound('whatsapp:_smoke@c.us', Date.now())" 2>/dev/null
# ojo: eso corre en OTRO proceso node — no comparte memoria. El guard real solo es testeable
# dentro del proceso vivo. Lo simulamos con un turnStartTs viejo tras un inbound real NO posible acá.
# En su lugar: verificamos que sin chatKey NO hay guard (paridad gmail) y que /accion sigue respondiendo.
R2=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":$OWNER_ID,\"accion\":{\"tipo\":\"olvidar_hecho\",\"clave\":\"_smoke_backstop\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS}")
echo "2) sin chatKey (sin guard, estilo gmail): $(echo "$R2" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("ok"))')"
# 3) acción con tipo inválido → {ok:false} y NO tira el proceso
R3=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":$OWNER_ID,\"accion\":{\"tipo\":\"accion_inexistente\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS,\"chatKey\":\"whatsapp:_smoke@c.us\"}")
echo "3) tipo inválido: ok=$(echo "$R3" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("ok"))') (esperado False, con error)"
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo "LISTO"
