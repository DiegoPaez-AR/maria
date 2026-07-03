#!/bin/bash
cd /root/secretaria
echo "── canary de este tick ──"
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -1
sleep 5
echo "── prod: enviar_whatsapp debe dar 'Acción desconocida' ──"
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
R=$(curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
  -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"enviar_whatsapp\",\"a\":\"x\",\"texto\":\"x\"},\"canalOrigen\":\"whatsapp\"}")
echo "→ $(echo "$R" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("error") or "")[:70])')"
echo "── detalle del test que falla (temp DB, no toca nada) ──"
env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL \
  node --test test/executor-routing.wip 2>&1 | grep -B2 -A18 "not ok\|Error\|error:" | head -50
echo LISTO
