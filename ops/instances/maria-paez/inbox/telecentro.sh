#!/bin/bash
cd /root/secretaria
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "── libreta: telecentro ──"
sqlite3 "$DB" "select id,usuario_id,nombre,whatsapp,email,substr(notas,1,80) from contactos where lower(nombre) like '%telecentro%' or lower(notas) like '%telecentro%'"
echo "── eventos con telecentro (30 días) ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),canal,direccion,coalesce(nombre,de),substr(replace(cuerpo,char(10),' '),1,170) from eventos where (lower(cuerpo) like '%telecentro%' or lower(nombre) like '%telecentro%' or lower(de) like '%telecentro%') and timestamp >= datetime('now','-30 days') order by timestamp" | tail -30
echo "── wa-hook: descartes / desconocidos recientes ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),substr(replace(cuerpo,char(10),' '),1,200) from eventos where canal='sistema' and (cuerpo like 'wa-hook:%' ) and timestamp >= datetime('now','-14 days') order by timestamp desc" | head -25
echo "── MB: notifs entrantes de telecentro / descartes del listener (logs) ──"
grep -hiE "telecentro" logs/maria-paez/out.log logs/maria-paez/out__*.log 2>/dev/null | tail -20 | cut -c1-220
echo "── MB: todo lo que el listener descartó últimos 3 días ──"
grep -hE "\[MB" logs/maria-paez/out.log | grep -iE "descart|redact|hidden|sin acción|ignor|filtr|grupo|group" | tail -15 | cut -c1-200
echo "── últimas entrantes por WA (3 días) ──"
sqlite3 "$DB" "select datetime(timestamp,'-3 hours'),coalesce(nombre,de),substr(replace(cuerpo,char(10),' '),1,80) from eventos where canal='whatsapp' and direccion='entrante' and timestamp >= datetime('now','-3 days') order by timestamp desc" | head -15
grep -hE "\[MB.*\[notif\] entrante" logs/maria-paez/out.log | tail -10 | cut -c1-160
echo LISTO
