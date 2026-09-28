#!/bin/bash
cd /root/secretaria
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "── el fallo ──"
grep -h "quitar_pendiente" logs/maria-paez/out.log logs/maria-paez/error.log | grep "^2026-09-28" | tail -5 | cut -c1-250
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),substr(replace(cuerpo,char(10),' '),1,220) from eventos where canal='sistema' and cuerpo like '%quitar_pendiente%' and date(timestamp,'-3 hours')='2026-09-28' order by timestamp desc limit 5"
echo "── pendientes abiertos de Diego hoy ──"
sqlite3 "$DB" "select id,estado,dueno,disparador,substr(\"desc\",1,110),substr(coalesce(meta_json,''),1,80) from pendientes where usuario_id=1 and (estado='abierto' or date(creado,'-3 hours')='2026-09-28') order by id desc limit 12"
echo "── follow-ups vivos ──"
sqlite3 "$DB" "select id,estado,esperando_de,substr(descripcion,1,90) from follow_ups where estado in ('abierto','disparado') order by id desc limit 6"
echo "── último turno TG ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),direccion,substr(replace(cuerpo,char(10),' '),1,200) from eventos where canal='telegram' and usuario_id=1 order by timestamp desc limit 4"
echo LISTO
