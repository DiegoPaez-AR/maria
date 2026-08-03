#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== nginx últimos requests =="
grep -h "wa-maria" /var/log/nginx/*.log 2>/dev/null | tail -4 | awk '{print $4, "->", $9, "bytes:", $10}'
echo "== eventos autoresponder (30min) =="
sqlite3 "$DB" "SELECT timestamp, direccion, substr(cuerpo,1,60) FROM eventos WHERE metadata_json LIKE '%autoresponder%' AND timestamp > datetime('now','-30 minutes') ORDER BY id DESC LIMIT 6;"
echo "== wa_hook logs sistema (30min) =="
sqlite3 "$DB" "SELECT timestamp, substr(cuerpo,1,90) FROM eventos WHERE metadata_json LIKE '%wa_hook%' AND timestamp > datetime('now','-30 minutes') ORDER BY id DESC LIMIT 4;"
echo "== pm2 log wa-hook/claude (30min) =="
grep -aE "wa-hook|GMAIL|Claude" /root/.pm2/logs/maria-paez-*.log 2>/dev/null | grep -a "$(date +%Y-%m-%d)" | tail -8
