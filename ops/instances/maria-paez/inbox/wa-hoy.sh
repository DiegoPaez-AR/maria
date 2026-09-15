#!/bin/bash
cd /root/secretaria
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "── wa_outbox desde el 12/9 ──"
sqlite3 "$DB" "select id, datetime(creado,'-3 hours'), numero, estado, intentos, datetime(tomado_en,'-3 hours'), substr(replace(texto,char(10),' '),1,90) from wa_outbox where creado >= '2026-09-12' order by id"
echo "── eventos hoy y 12/9 (no sistema) ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),canal,direccion,coalesce(nombre,de),substr(replace(cuerpo,char(10),' '),1,150) from eventos where date(timestamp,'-3 hours') in ('2026-09-12','2026-09-14','2026-09-15') and canal!='sistema' and cuerpo not like '☀️%' and cuerpo not like '⏰%' order by timestamp" | tail -30
echo "── sistema hoy ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),substr(replace(cuerpo,char(10),' '),1,160) from eventos where date(timestamp,'-3 hours') in ('2026-09-12','2026-09-15') and canal='sistema' and cuerpo not like 'claude_call%' and cuerpo not like '%arrancó%' and cuerpo not like 'poda%' and cuerpo not like '%memoria-curada%' and cuerpo not like 'meeting-prep%' order by timestamp" | tail -25
echo "── MB log 12/9 y hoy ──"
grep -hE "^2026-09-(12|14|15)" logs/maria-paez/out.log | grep -E "\[MB|outbox|MB-" | grep -vE "barrido|latido|\[notif\] entrante" | tail -40 | cut -c1-200
echo "── último latido del teléfono ──"
grep -h "\[MB" logs/maria-paez/out.log | tail -1 | cut -c1-120
echo LISTO
