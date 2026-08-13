#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== último evento WhatsApp =="
sqlite3 "$DB" "SELECT timestamp, direccion, COALESCE(nombre,de), substr(cuerpo,1,40) FROM eventos WHERE canal='whatsapp' ORDER BY id DESC LIMIT 5;"
echo "== requests del teléfono al hook (nginx, por día) =="
for f in /var/log/nginx/access.log /var/log/nginx/access.log.1; do
  [ -f "$f" ] && grep -h "wa-maria" "$f" 2>/dev/null
done | awk '{print substr($4,2,11)}' | sort | uniq -c | tail -8
echo "== último request =="
for f in /var/log/nginx/access.log /var/log/nginx/access.log.1; do
  [ -f "$f" ] && grep -h "wa-maria" "$f" 2>/dev/null
done | tail -3 | awk '{print $4, $7, "->", $9}' | sed 's|/hooks/wa-maria/[A-Za-z0-9]*|...|'
echo "== falla telegram de ayer (contexto) =="
grep -a -A 6 "No se pudo extraer JSON" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -14
