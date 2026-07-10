#!/bin/bash
set -e
DB="${MARIA_DB:?falta MARIA_DB}"
ST=/root/secretaria/state/maria-paez
echo "== programados vencidos durante el bloqueo (se cancelan) =="
sqlite3 "$DB" "SELECT id, cuando, substr(texto,1,50) FROM programados WHERE enviado=0 AND cuando <= strftime('%Y-%m-%dT%H:%M:%f','now');"
sqlite3 "$DB" "UPDATE programados SET enviado=1, metadata_json=json_set(COALESCE(metadata_json,'{}'),'\$.cancelado','vencido durante bloqueo WA 2026-07-07/10') WHERE enviado=0 AND cuando <= strftime('%Y-%m-%dT%H:%M:%f','now');"
echo "== quedan pendientes =="
sqlite3 "$DB" "SELECT id, cuando, substr(texto,1,40) FROM programados WHERE enviado=0;"
echo "== reactivando WA =="
rm -f "$ST/wa-apagado" "$ST/wa-retry-after"
rm -rf "$ST/.wwebjs_auth/session" 2>/dev/null
cd /root/secretaria && pm2 restart maria-paez --update-env >/dev/null 2>&1
sleep 12
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
tail -4 /root/.pm2/logs/maria-pa*out*.log | grep -a "túnel\|tunel\|WA" | tail -3
