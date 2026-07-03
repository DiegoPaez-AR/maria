#!/bin/bash
cd /root/secretaria
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -1
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
TS=$(date +%s%3N)
R3=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"enviar_whatsapp\",\"a\":\"x\",\"texto\":\"x\"},\"canalOrigen\":\"whatsapp\",\"turnStartTs\":$TS}")
echo "enviar_whatsapp → $(echo "$R3" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("ok:", d.get("ok"), "|", (d.get("error") or "")[:60])')"
echo LISTO
