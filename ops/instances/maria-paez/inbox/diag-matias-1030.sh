#!/bin/bash
# Solo lectura: qué pasó con Matías Israel (mensaje que no se pudo mandar)
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a
  echo "── eventos desde 29/10 12:00 con Matías / fallos / Diego ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select e.id, datetime(e.timestamp,'-3 hours'), e.canal, e.direccion, coalesce(u.nombre,e.nombre,e.de,''), replace(substr(coalesce(e.asunto||' :: ','')||e.cuerpo,1,1200),char(10),' ⏎ '), case when e.cuerpo like 'acci%' or e.cuerpo like 'follow%' or e.cuerpo like 'wa-hook%' or e.cuerpo like '%no verific%' then substr(coalesce(e.metadata_json,''),1,900) else '' end from eventos e left join usuarios u on u.id=e.usuario_id where e.timestamp >= '2026-10-29 15:00' and e.cuerpo not like 'claude_call%' and e.cuerpo not like 'meeting-prep:%' and e.cuerpo not like 'poda-%' and e.cuerpo not like '☀️%' order by e.id;"
  echo "── outbox desde 29/10 ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, intentos, numero, datetime(creado,'-3 hours'), datetime(entregado,'-3 hours'), replace(substr(texto,1,250),char(10),' '), substr(coalesce(metadata_json,''),1,600) from wa_outbox where creado >= '2026-10-29 15:00';"
  echo "── pendientes/follow-ups Matías ──"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, datetime(creado,'-3 hours'), datetime(cerrado,'-3 hours'), substr(\"desc\",1,200) from pendientes where meta_json like '%54824124%' or \"desc\" like '%Matías%' or \"desc\" like '%Matias%';"
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, datetime(creado,'-3 hours'), substr(descripcion,1,150), esperando_de, vence_en, disparado_en from follow_ups where esperando_de like '%54824124%';" 2>&1 )
echo "── logs ──"
grep -h -E "^2026-10-(29 1[5-9]|29 2|30)" logs/maria-paez/out.log logs/maria-paez/error.log logs/maria-paez/out__2026-10-30*.log logs/maria-paez/error__2026-10-30*.log 2>/dev/null | grep -i -E "matias|matías|54824124|fall|error|follow|wa-outbox|frio|enviar|outbox|vencid" | grep -v "TG\] poll" | sort -u | cut -c1-400 | tail -60
