#!/bin/bash
cd /root/secretaria
M=/root/secretaria/state/maria-paez/db/maria.sqlite; S=/root/secretaria/state/sofia-bruscoli/db/maria.sqlite
echo "══ 1. Telecentro 29/9: los 6 descartados por viejo ══"
sqlite3 "$M" "select datetime(timestamp,'-3 hours'),direccion,substr(replace(cuerpo,char(10),' '),1,150) from eventos where canal='whatsapp' and (de like '%1163809500%' or nombre like 'Telecentro%') and date(timestamp,'-3 hours')='2026-09-29' order by timestamp" | head -40
echo "══ 2. Personal 28/9: chat_equivocado ══"
grep -hE "^2026-09-28" logs/maria-paez/out.log | grep -E "chat ABIERTO ES OTRO|#277|#279" | head -6 | cut -c1-230
sqlite3 "$M" "select id,nombre,whatsapp from contactos where lower(nombre) like '%personal%'"
sqlite3 "$M" "select datetime(timestamp,'-3 hours'),canal,direccion,substr(replace(cuerpo,char(10),' '),1,160) from eventos where (lower(cuerpo) like '%personal%' or lower(cuerpo) like '%flow%') and canal in ('telegram','whatsapp') and timestamp>='2026-09-28' order by timestamp" | tail -12
echo "══ 3. Sofia: Telegram 409 (W39) ══"
grep -hE "409|recuperado tras|loop-guard" logs/sofia-bruscoli/out.log logs/sofia-bruscoli/error.log logs/sofia-bruscoli/*__*.log 2>/dev/null | grep -E "^2026-09-2|^2026-10" | sort | sed -E 's/\{.*//' | uniq -c | sort -k2 | head -20 | cut -c1-150
echo "-- ¿quién más usa el token de Sofia? procesos node:"; ps -eo pid,etimes,cmd | grep -E "node|index.js" | grep -v grep | cut -c1-120
echo "══ 4. Sofia: última actividad de Noelia ══"
sqlite3 "$S" "select datetime(max(timestamp),'-3 hours') from eventos where direccion='entrante' and canal in ('telegram','gmail') and usuario_id=2"
sqlite3 "$S" "select date(timestamp,'-3 hours') d, count(*) from eventos where direccion='entrante' and timestamp>='2026-09-09' group by 1"
sqlite3 "$S" "select datetime(timestamp,'-3 hours'),canal,direccion,substr(replace(cuerpo,char(10),' '),1,160) from eventos where canal in ('telegram','gmail','whatsapp') and timestamp>='2026-09-20' and cuerpo not like '☀️%' order by timestamp" | tail -15
echo "══ 5. tipo de consulta desconocido ══"
grep -h "tipo de consulta desconocido" -B2 logs/maria-paez/*.log 2>/dev/null | head -8 | cut -c1-200
echo "══ 6. 6/10 JSON fail: ¿Diego recibió respuesta? ══"
sqlite3 "$M" "select datetime(timestamp,'-3 hours'),direccion,substr(replace(cuerpo,char(10),' '),1,200) from eventos where canal='telegram' and usuario_id=1 and timestamp between '2026-10-06 22:40' and '2026-10-06 23:10' order by timestamp"
echo "══ 7. gasto 30 días por instancia y tipo ══"
for DB in $M $S; do sqlite3 "$DB" "select substr(cuerpo, 13, instr(substr(cuerpo,13),':')-1) tipo, count(*) n, round(sum(cast(substr(cuerpo, instr(cuerpo,'\$')+1) as real)),2) usd from eventos where canal='sistema' and cuerpo like 'claude_call%' and timestamp >= datetime('now','-30 days') group by 1 order by 3 desc" | head -8; echo "   total: $(sqlite3 "$DB" "select round(sum(cast(substr(cuerpo, instr(cuerpo,'\$')+1) as real)),2) from eventos where canal='sistema' and cuerpo like 'claude_call%' and timestamp >= datetime('now','-30 days')")"; echo ---; done
echo "══ 8. usuarios pausados / dormidos 1/10 ══"
sqlite3 "$M" "select nombre, pausado, date(pausado_desde) from usuarios where activo=1 and coalesce(pausado,0)=1"
sqlite3 "$M" "select datetime(timestamp,'-3 hours'),substr(cuerpo,1,160) from eventos where cuerpo like '%dormid%' and timestamp>='2026-10-01' limit 3"
echo "══ 9. outbox 30 días (ambas) ══"
for DB in $M $S; do sqlite3 "$DB" "select estado,count(*) from wa_outbox where creado>=datetime('now','-30 days') group by 1"; echo ---; done
echo "══ 10. healthcheck/alertas/disco ══"
ls ops/instances/*/snapshots/HEALTHCHECK-ALERT.json 2>/dev/null; df -h / | tail -1; du -sh logs; ls logs/maria-paez | wc -l
pm2 jlist | python3 -c "import json,sys,time;[print(' ',p['name'],p['pm2_env']['status'],'restarts',p['pm2_env']['restart_time'],'up_h',int((time.time()*1000-p['pm2_env']['pm_uptime'])//3600000)) for p in json.load(sys.stdin)]"
echo "══ 11. follow-ups / pendientes abiertos Maria ══"
sqlite3 "$M" "select id,estado,substr(descripcion,1,80) from follow_ups where estado in ('abierto','disparado')"
sqlite3 "$M" "select id,dueno,substr(\"desc\",1,90) from pendientes where estado='abierto' and usuario_id=1 order by id desc" | head -12
echo LISTO
