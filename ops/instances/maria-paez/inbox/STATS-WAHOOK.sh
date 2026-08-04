#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== tráfico wa-hook por día =="
sqlite3 "$DB" "SELECT date(timestamp), direccion, COUNT(*) FROM eventos WHERE canal='whatsapp' AND metadata_json LIKE '%autoresponder%' GROUP BY 1,2 ORDER BY 1;"
echo "== por remitente =="
sqlite3 "$DB" "SELECT COALESCE(nombre,de), direccion, COUNT(*) FROM eventos WHERE canal='whatsapp' AND metadata_json LIKE '%autoresponder%' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10;"
echo "== desconocidos/ambiguos/sin-numero =="
sqlite3 "$DB" "SELECT substr(cuerpo,1,70), COUNT(*) FROM eventos WHERE metadata_json LIKE '%wa_hook%' GROUP BY 1 ORDER BY 2 DESC LIMIT 8;"
echo "== deadline hits (log) =="
grep -ac "wa-hook] deadline" /root/.pm2/logs/maria-paez-out.log 2>/dev/null || echo 0
grep -a "wa-hook] deadline" /root/.pm2/logs/maria-paez-out.log 2>/dev/null | tail -3
echo "== requests nginx hoy/ayer =="
grep -h "wa-maria" /var/log/nginx/access.log 2>/dev/null | awk '{print substr($4,2,11)}' | sort | uniq -c | tail -4
