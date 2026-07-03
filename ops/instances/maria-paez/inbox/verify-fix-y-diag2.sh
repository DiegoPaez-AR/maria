#!/bin/bash
cd /root/secretaria
SECRET=$(grep -E '^ASISTENTE_INTERNAL_SECRET=' config/secrets.conf | cut -d= -f2- | tr -d '"')
PORT=$(grep -E '^ASISTENTE_INTERNAL_PORT=' config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
for i in 1 2 3; do
  R=$(curl -s -m 10 -X POST "http://127.0.0.1:$PORT/accion" -H "x-intensa-secret: $SECRET" -H 'Content-Type: application/json' \
    -d '{"usuarioId":1,"accion":{"tipo":"enviar_whatsapp","a":"x","texto":"x"},"canalOrigen":"whatsapp"}')
  [ -n "$R" ] && break; sleep 5
done
echo "enviar_whatsapp → $(echo "$R" | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("error") or "")[:75])' 2>/dev/null || echo "(sin respuesta)")"
echo ""
echo "── test wip: salida cruda ──"
env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL \
  node --test test/executor-routing.wip 2>&1 | head -45
echo LISTO
