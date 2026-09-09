#!/bin/bash
cd /root/secretaria
SDB=/root/secretaria/state/sofia-bruscoli/db/maria.sqlite
MDB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "══ 1. Sofia ↔ Gastón 7/9 (outbox #11/#13 vencidos) ══"
sqlite3 "$SDB" "select datetime(timestamp,'-3 hours'),canal,direccion,coalesce(nombre,de),substr(replace(cuerpo,char(10),' '),1,160) from eventos where (de like '%1156408326%' or nombre like '%Gast%' or cuerpo like '%Gast%') and timestamp >= datetime('2026-09-07 03:00') and canal!='sistema' order by timestamp" | head -30
echo "══ 2. Sofia mail de Noelia 7/9 09:35 que falló ══"
sqlite3 "$SDB" "select datetime(timestamp,'-3 hours'),canal,direccion,substr(coalesce(asunto,''),1,60),substr(replace(cuerpo,char(10),' '),1,200) from eventos where canal='gmail' and timestamp between datetime('2026-09-07 11:00') and datetime('2026-09-07 14:00') order by timestamp"
sqlite3 "$SDB" "select datetime(timestamp,'-3 hours'),canal,direccion,substr(replace(cuerpo,char(10),' '),1,200) from eventos where timestamp between datetime('2026-09-07 12:20') and datetime('2026-09-07 13:00') and canal in ('telegram','gmail') order by timestamp" | head
echo "══ 3. Sofia: turnos en PROSA — ¿se perdieron acciones? ══"
grep -hE "^2026-09-0[4-9]" /root/.pm2/logs/sofia-bruscoli-error.log | grep -A3 "PROSA" | grep -vE "^--$" | cut -c1-230 | head -30
echo "══ 4. Maria: gcontacts-reconcile 20 fallidos ══"
grep -hE "^2026-09-06" /root/.pm2/logs/maria-paez-out.log | grep -i "gcontacts" | grep -iv " ok" | cut -c1-160 | head -8
echo "══ 5. Maria: Walby 7/9 + Lavadero hoy ══"
sqlite3 "$MDB" "select datetime(timestamp,'-3 hours'),canal,direccion,coalesce(nombre,de),substr(replace(cuerpo,char(10),' '),1,140) from eventos where (nombre like '%Walby%' or cuerpo like '%Walby%' or nombre like '%Lavadero%' or cuerpo like '%Lavadero%' or de like '%1139499903%') and timestamp >= datetime('2026-09-05 03:00') and canal!='sistema' order by timestamp" | head -30
echo "══ 6. follow-ups 'disparado' viejos: ¿qué hace el loop con ellos? ══"
sqlite3 "$MDB" "select id, estado, datetime(creado,'-3 hours'), datetime(vence,'-3 hours'), escalado, substr(descripcion,1,60) from follow_ups where estado='disparado' order by id" 2>&1 | head -12
sqlite3 "$MDB" "pragma table_info(follow_ups)" | cut -d'|' -f2 | tr '\n' ' '; echo
echo "══ 7. daily-report ══"
grep -h "daily-report" /var/spool/cron/crontabs/root 2>/dev/null | head -2
ls -la /root/secretaria/state/*daily* /var/log/maria-daily* 2>/dev/null | tail -3
grep -h "daily" /var/log/syslog 2>/dev/null | tail -2
sqlite3 "$MDB" "select datetime(timestamp,'-3 hours'), substr(cuerpo,1,80) from eventos where cuerpo like '%daily%' or cuerpo like '%reporte diario%' order by timestamp desc limit 3"
echo "══ 8. Sofia: Saka / Zacarías 6-8/9 ══"
sqlite3 "$SDB" "select datetime(timestamp,'-3 hours'),canal,direccion,coalesce(nombre,de),substr(replace(cuerpo,char(10),' '),1,150) from eventos where (nombre like '%Saka%' or de like '%2215968555%' or de like '%zacaria%' or cuerpo like '%Saka%' or cuerpo like '%Zaca%') and canal!='sistema' order by timestamp" | head -30
echo "══ 9. Sofia contactos + gcontacts ══"
sqlite3 "$SDB" "select id,nombre,whatsapp,email,substr(notas,1,50) from contactos order by id"
sqlite3 "$SDB" "select count(*) from gcontacts_sync"
echo LISTO
