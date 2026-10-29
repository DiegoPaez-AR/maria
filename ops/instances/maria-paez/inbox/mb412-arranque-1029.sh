#!/bin/bash
# Solo lectura: arranque de la 4.12 en ambos teléfonos
cd /root/secretaria/logs
for s in maria-paez sofia-bruscoli; do
  echo "════ $s"
  grep "\[MB " $s/out.log | awk '$1>="2026-10-29"' | grep -v "al día" | grep -E "upd|boot|svc|listener|accesibilidad|instalador|0-tap|outbox|frio|notif\] entrante" | tail -20 | cut -c1-220
  echo "── última línea MB ──"; grep "\[MB " $s/out.log | tail -1 | cut -c1-160
done
echo "── polls a pendiente.txt últimos 10 min ──"
L=/var/log/nginx/intensa.io.access.log; desde=$(date -d '-10 min' '+%H:%M')
grep "pendiente.txt" $L | grep "$(date '+%d/%b/%Y'):" | awk -v d="$desde" '{t=substr($4,14,5); if (t>=d) {split($7,p,"/"); k=p[3]; n[k]++; last[k]=substr($4,14,8)}} END {for (k in n) print "  " k ": " n[k] " polls, último " last[k]}'
