#!/bin/bash
# Solo lectura: gestión Nespresso
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a
  Q="(lower(cuerpo) like '%nespres%' or lower(coalesce(asunto,'')) like '%nespres%' or lower(coalesce(metadata_json,'')) like '%nespres%' or lower(coalesce(nombre,'')) like '%nespres%' or lower(coalesce(de,'')) like '%nespres%')"
  echo "── menciones ──"; sqlite3 "$MARIA_DB" "select min(id), max(id), datetime(min(timestamp),'-3 hours'), datetime(max(timestamp),'-3 hours'), count(*) from eventos where $Q;"
  MIN=$(sqlite3 "$MARIA_DB" "select min(id) from eventos where $Q and timestamp >= '2026-10-20';")
  echo "── hilo desde la primera mención reciente (sin telemetría) ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, datetime(timestamp,'-3 hours'), canal, direccion, coalesce(nombre,de,''), replace(substr(coalesce(asunto||' :: ','')||cuerpo,1,1500),char(10),' ⏎ '), case when cuerpo like 'acci%' or cuerpo like 'unknown-flow%' or cuerpo like 'mb-%' then substr(coalesce(metadata_json,''),1,800) else '' end from eventos where id >= ${MIN:-999999999} - 2 and cuerpo not like 'claude_call%' and cuerpo not like 'meeting-prep:%' and cuerpo not like 'poda-%' order by id;"
  echo "── outbox / pendientes / follow-ups hoy ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, intentos, numero, datetime(creado,'-3 hours'), datetime(entregado,'-3 hours'), replace(substr(texto,1,300),char(10),' '), substr(coalesce(metadata_json,''),1,500) from wa_outbox where creado >= '2026-10-29';"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, dueno, datetime(creado,'-3 hours'), datetime(cerrado,'-3 hours'), substr(\"desc\",1,250) from pendientes where creado >= '2026-10-29' or cerrado >= '2026-10-29';"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, datetime(creado,'-3 hours'), substr(descripcion,1,200), esperando_de, vence_en from follow_ups where creado >= '2026-10-29';" )
echo "── logs hoy (sin ruido) ──"
grep -h "^2026-10-29" logs/maria-paez/out.log logs/maria-paez/error.log | grep -v -E "al día|\[TG\] poll|meeting-prep|programados\]|barrido" | sort | cut -c1-450 | tail -90
