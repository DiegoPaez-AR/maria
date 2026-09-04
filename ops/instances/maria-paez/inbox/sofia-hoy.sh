#!/bin/bash
DB=/root/secretaria/state/sofia-bruscoli/db/maria.sqlite
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),canal,direccion,coalesce(nombre,de),substr(replace(cuerpo,char(10),' '),1,150) from eventos where date(timestamp,'-3 hours')='2026-09-04' and canal!='sistema' order by timestamp" 2>&1
echo "── sistema hoy ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),substr(replace(cuerpo,char(10),' '),1,150) from eventos where date(timestamp,'-3 hours')='2026-09-04' and canal='sistema' and cuerpo not like '%arrancó%' and cuerpo not like '%shutdown%' order by timestamp" 2>&1
echo "── usuarios ──"; sqlite3 "$DB" "select id,nombre,telegram_chat_id from usuarios"
echo "── pendientes ──"; sqlite3 "$DB" "select id,estado,substr(\"desc\",1,100) from pendientes" 2>&1 | tail -5
echo "── v4.6 barrido ──"
grep -h "MB v4.6" /root/.pm2/logs/maria-paez-out.log /root/.pm2/logs/sofia-bruscoli-out.log | grep -E "barrido|conectado" | tail -6 | cut -c1-150
echo LISTO
