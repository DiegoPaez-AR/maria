#!/bin/bash
# Solo lectura: hilo "Reunión Mónaco" 26-28/10
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a
  echo "── eventos 26/10 18:00 → ahora (sin telemetría, sin TG/WA ajenos) ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select e.id, datetime(e.timestamp,'-3 hours'), e.canal, e.direccion, coalesce(e.nombre,e.de,''), replace(substr(coalesce(e.asunto||' :: ','')||e.cuerpo,1,1800),char(10),' ⏎ '), case when e.cuerpo like 'acci%' or e.cuerpo like 'unknown-flow%' then substr(coalesce(e.metadata_json,''),1,900) else '' end from eventos e where e.timestamp >= '2026-10-27 23:30' and e.cuerpo not like 'claude_call%' and e.cuerpo not like 'meeting-prep:%' and e.cuerpo not like 'poda-%' and (e.canal in ('gmail','sistema','calendar') or lower(e.cuerpo) like '%monaco%' or lower(e.cuerpo) like '%mónaco%' or lower(e.cuerpo) like '%stefano%' or lower(e.cuerpo) like '%ricardo%' or lower(e.cuerpo) like '%reuni%') order by e.id;"
  echo "── pendientes / follow-ups desde 27/10 ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, dueno, disparador, datetime(creado,'-3 hours'), datetime(cerrado,'-3 hours'), substr(\"desc\",1,300), substr(coalesce(meta_json,''),1,400) from pendientes where creado >= '2026-10-27 23:00' or cerrado >= '2026-10-27 23:00';"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select * from follow_ups where creado >= '2026-10-27 23:00';" 2>&1 | cut -c1-400 )
echo "── logs 27/10 18:00 → ahora ──"
cat logs/maria-paez/out__2026-10-28*.log logs/maria-paez/out.log 2>/dev/null | awk '($1" "$2)>="2026-10-27 18:00"' | grep -v -E "\[MB |al día|\[TG\] poll|programados\]|morning-brief" | cut -c1-500 | tail -80
