#!/bin/bash
# Solo lectura: salud de MariaBridge tras el update a 4.10 (15/10)
echo "hora VPS: $(date '+%F %H:%M %Z')"
L=/var/log/nginx/intensa.io.access.log
echo "── polls a pendiente.txt por bridge (últimos 15 min) ──"
desde=$(date -d '-15 min' '+%d/%b/%Y:%H:%M')
awk -v d="$desde" '/pendiente.txt/ { match($0,/\[[^]]+\]/); t=substr($0,RSTART+1,17); if (t>=d) { match($0,/wa-hook\/[^\/]+/); k=substr($0,RSTART+8,6); n[k]++; last[k]=t } } END { for (k in n) print "  secret " k "…: " n[k] " polls, último " last[k] }' $L
echo "── códigos HTTP de rutas wa-hook desde 12:30 ──"
grep "wa-hook" $L | awk '$4 >= "[15/Oct/2026:12:30"' | awk '{split($7,p,"/"); print "  " p[4] " " $9}' | sort | uniq -c | sort -rn | head -20
for s in maria-paez sofia-bruscoli; do
  echo "════ $s ════"
  echo "── MB desde 12:00 (sin 'al día') ──"
  grep "\[MB " /root/secretaria/logs/$s/out.log | awk '$3>="2026-10-15" && $4>="12:00"' | grep -v "al día" | tail -40
  echo "── MB error.log hoy ──"
  grep "2026-10-15" /root/secretaria/logs/$s/error.log | grep -iv "TG\] poll" | tail -15
  cf=/root/secretaria/config/instances/$s.conf
  ( set -a; . "$cf"; set +a
    echo "── wa_outbox últimos 8 ──"
    sqlite3 -header "$MARIA_DB" "select id, estado, intentos, substr(numero,1,14) num, creado, entregado, substr(texto,1,40) txt from wa_outbox order by id desc limit 8;" 2>&1
    echo "── eventos WA entrantes hoy ──"
    sqlite3 "$MARIA_DB" "select count(*), max(timestamp) from eventos where canal='whatsapp' and direccion='entrante' and timestamp>='2026-10-15';" 2>&1
    echo "── pendientes abiertos que mencionan Personal/chat ──"
    sqlite3 "$MARIA_DB" "select * from pendientes where id=340;" 2>&1
  )
done
