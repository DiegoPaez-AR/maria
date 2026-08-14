#!/bin/bash
DB="${MARIA_DB:?}"
echo "== polls de los últimos 20 min (hora -03) =="
tail -400 /var/log/nginx/intensa.io.access.log 2>/dev/null | grep "pendiente.txt" | tail -12 | awk '{print $4}' | sed 's/\[//'
echo "== cantidad de polls por hora (hoy) =="
grep "pendiente.txt" /var/log/nginx/intensa.io.access.log 2>/dev/null | awk '{print substr($4,14,2)}' | sort | uniq -c | tail -6
