#!/bin/bash
cd /root/secretaria
echo "── canary del cleanup ──"
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -2
echo "── pm2 ──"
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo "── smoke /accion post-cleanup ──"
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
TS=$(date +%s%3N)
R=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"recordar_hecho\",\"clave\":\"_smoke_cleanup\",\"valor\":\"tmp\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS,\"chatKey\":\"whatsapp:_smoke@c.us\"}")
echo "recordar_hecho → $(echo "$R" | head -c 110)"
R2=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"olvidar_hecho\",\"clave\":\"_smoke_cleanup\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS}")
echo "olvidar_hecho → $(echo "$R2" | head -c 80)"
R3=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"enviar_whatsapp\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS}")
echo "sinónimo viejo (enviar_whatsapp) → $(echo "$R3" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("ok:", d.get("ok"), "|", (d.get("error") or "")[:80])')"
echo LISTO
