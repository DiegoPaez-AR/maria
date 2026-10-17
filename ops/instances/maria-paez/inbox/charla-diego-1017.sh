#!/bin/bash
# Solo lectura: charla de Diego con Maria 16-17/10 + logs
cf=/root/secretaria/config/instances/maria-paez.conf
set -a; . "$cf"; set +a
echo "── eventos desde 2026-10-16 12:00 UTC (sin claude_call) ──"
sqlite3 -separator ' | ' "$MARIA_DB" "select id, timestamp, canal, direccion, coalesce(nombre,de,''), replace(substr(cuerpo,1,700),char(10),' ⏎ '), case when cuerpo like 'acción%' or cuerpo like 'acci%fall%' then substr(coalesce(metadata_json,''),1,400) else '' end from eventos where timestamp>='2026-10-16 12:00' and cuerpo not like 'claude_call%' order by id;"
echo "── wa_outbox desde 16/10 ──"
sqlite3 -header "$MARIA_DB" "select id, estado, intentos, numero, creado, entregado, replace(substr(texto,1,200),char(10),' ') txt, substr(coalesce(metadata_json,''),1,300) meta from wa_outbox where creado>='2026-10-16' order by id;"
echo "── pendientes abiertos ──"
sqlite3 "$MARIA_DB" "select id, creado, desc from pendientes where estado='abierto' order by id desc limit 10;"
echo "── out.log (sin TG poll) desde 16/10 13:00 ──"
awk '$3>="2026-10-16"' /root/secretaria/logs/maria-paez/out.log | grep -v "al día" | tail -150 | cut -c1-400
echo "── error.log 16-17/10 ──"
grep -h "2026-10-1[67]" /root/secretaria/logs/maria-paez/error.log | grep -v "TG\] poll" | tail -40 | cut -c1-400
