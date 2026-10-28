#!/bin/bash
# Solo lectura: gestión de la reunión "Monaco" (Diego)
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a
  Q="(lower(cuerpo) like '%monaco%' or lower(cuerpo) like '%mónaco%' or lower(coalesce(asunto,'')) like '%monaco%' or lower(coalesce(asunto,'')) like '%mónaco%' or lower(coalesce(metadata_json,'')) like '%monaco%')"
  echo "── primera/última mención ──"
  sqlite3 "$MARIA_DB" "select min(id), max(id), datetime(min(timestamp),'-3 hours'), datetime(max(timestamp),'-3 hours'), count(*) from eventos where $Q;"
  MIN=$(sqlite3 "$MARIA_DB" "select min(id) from eventos where $Q;")
  echo "── hilo completo desde la primera mención (sin telemetría) ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select e.id, datetime(e.timestamp,'-3 hours'), e.canal, e.direccion, coalesce(e.nombre,e.de,''), replace(substr(coalesce(e.asunto||' :: ','')||e.cuerpo,1,1200),char(10),' ⏎ '), case when e.cuerpo like 'acci%' then substr(coalesce(e.metadata_json,''),1,700) else '' end from eventos e where e.id >= ${MIN:-0} - 3 and e.cuerpo not like 'claude_call%' and e.cuerpo not like 'meeting-prep:%' and e.cuerpo not like 'poda-%' order by e.id;" | head -220
  echo "── pendientes / follow-ups / outbox / programados ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, dueno, datetime(creado,'-3 hours'), datetime(cerrado,'-3 hours'), substr(\"desc\",1,200) from pendientes where lower(\"desc\") like '%monaco%' or lower(\"desc\") like '%mónaco%' or id >= (select min(id) from pendientes where creado >= (select min(timestamp) from eventos where $Q));"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, datetime(creado,'-3 hours'), substr(descripcion,1,150), esperando_de, vence_en from follow_ups where creado >= (select min(timestamp) from eventos where $Q);" 2>&1
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, intentos, numero, datetime(creado,'-3 hours'), datetime(entregado,'-3 hours'), replace(substr(texto,1,400),char(10),' ') from wa_outbox where creado >= (select min(timestamp) from eventos where $Q);"
  echo "── eventos de calendario guardados ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select * from eventos_calendar where lower(coalesce(titulo,summary,'')) like '%monaco%' limit 5;" 2>&1 | head -5 )
echo "── logs ──"
grep -h -i "monaco\|mónaco" logs/maria-paez/out__*.log logs/maria-paez/out.log logs/maria-paez/error*.log 2>/dev/null | sort | cut -c1-400 | tail -40
