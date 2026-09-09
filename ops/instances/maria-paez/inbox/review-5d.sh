#!/bin/bash
cd /root/secretaria
for S in maria-paez sofia-bruscoli; do
  DB=/root/secretaria/state/$S/db/maria.sqlite
  echo "════════════════ $S ════════════════"
  echo "── actividad por día (hora local) ──"
  sqlite3 -column "$DB" "select date(timestamp,'-3 hours') dia, sum(canal='telegram' and direccion='entrante') tg_in, sum(canal='telegram' and direccion='saliente') tg_out, sum(canal='whatsapp' and direccion='entrante') wa_in, sum(canal='whatsapp' and direccion='saliente') wa_out, sum(canal='gmail' and direccion='entrante') mail_in, sum(canal='gmail' and direccion='saliente') mail_out, sum(canal='calendar') cal from eventos where timestamp >= datetime('2026-09-04 03:00') group by 1 order by 1"
  echo "── quién habló (inbound, 5 días) ──"
  sqlite3 -column "$DB" "select coalesce(u.nombre, e.nombre, e.de) quien, e.canal, count(*) n from eventos e left join usuarios u on u.id=e.usuario_id and e.canal in ('telegram') where e.timestamp >= datetime('2026-09-04 03:00') and e.direccion='entrante' group by 1,2 order by 3 desc limit 20"
  echo "── gasto por día (claude_call) ──"
  sqlite3 -column "$DB" "select date(timestamp,'-3 hours') dia, count(*) llamadas, round(sum(cast(substr(cuerpo, instr(cuerpo,'\$')+1) as real)),2) usd from eventos where canal='sistema' and cuerpo like 'claude_call%' and timestamp >= datetime('2026-09-04 03:00') group by 1"
  echo "── eventos de sistema notables (5 días) ──"
  sqlite3 "$DB" "select datetime(timestamp,'-3 hours'), substr(replace(cuerpo,char(10),' '),1,170) from eventos where canal='sistema' and timestamp >= datetime('2026-09-04 03:00') and cuerpo not like 'claude_call%' and cuerpo not like 'acción ejecutada%' and cuerpo not like '%arrancó%' and cuerpo not like '%shutdown%' and cuerpo not like 'meeting-prep%' and cuerpo not like '%memoria-curada%' order by timestamp" | head -60
  echo "── acciones FALLIDAS ──"
  sqlite3 "$DB" "select datetime(timestamp,'-3 hours'), substr(cuerpo,1,150) from eventos where canal='sistema' and cuerpo like 'acción FALLÓ%' and timestamp >= datetime('2026-09-04 03:00')" | head -20
  echo "── wa_outbox 5 días ──"
  sqlite3 -column "$DB" "select estado, count(*) n from wa_outbox where creado >= datetime('2026-09-04 03:00') group by 1"
  sqlite3 "$DB" "select id, datetime(creado,'-3 hours'), numero, estado, intentos, substr(replace(texto,char(10),' '),1,70) from wa_outbox where creado >= datetime('2026-09-04 03:00') and estado not in ('entregado') order by id" | head -15
  echo "── follow-ups / pendientes abiertos ──"
  sqlite3 "$DB" "select id, estado, datetime(creado,'-3 hours'), substr(descripcion,1,90) from follow_ups where estado in ('abierto','disparado') order by id desc limit 8" 2>&1
  sqlite3 "$DB" "select id, estado, substr(\"desc\",1,90) from pendientes where estado='abierto' order by id desc limit 8" 2>&1
  echo "── error.log agrupado (5 días) ──"
  grep -hE "^2026-09-0[4-9]" /root/.pm2/logs/$S-error.log 2>/dev/null | sed 's/^[0-9-]* [0-9:]*: //' | cut -c1-95 | sort | uniq -c | sort -rn | head -15
  echo "── out.log: warn/fallo agrupado (5 días) ──"
  grep -hE "^2026-09-0[4-9]" /root/.pm2/logs/$S-out.log | grep -iE "warn|error|fall[oó]|descart|abort|timeout|inconclus|trabad|reintento|vencid|duplicado|presentacion|loop-guard|watchdog" | grep -v "TG\] poll error" | sed 's/^[0-9-]* [0-9:]*: //' | sed -E 's/[0-9]{2}:[0-9]{2}:[0-9]{2}//g' | cut -c1-110 | sort | uniq -c | sort -rn | head -25
  echo "── MariaBridge: versión y fallos ──"
  grep -hoE "\[MB v[0-9.]+\]" /root/.pm2/logs/$S-out.log | tail -1
  grep -hE "^2026-09-0[4-9]" /root/.pm2/logs/$S-out.log | grep "\[MB" | grep -iE "W |E |recuper|fallo|inconclu|verific" | sed 's/^[0-9-]* [0-9:]*: //' | cut -c1-120 | sort | uniq -c | sort -rn | head -12
  echo "── usuarios (servidos/pausados) ──"
  sqlite3 -column "$DB" "select count(*) activos, sum(coalesce(pausado,0)) pausados, sum(telegram_chat_id is not null) con_tg from usuarios where activo=1"
done
echo "════════ healthcheck / alertas ════════"
ls -la ops/instances/*/snapshots/HEALTHCHECK-ALERT.json 2>/dev/null
grep -h "hc-notify" /var/log/syslog 2>/dev/null | tail -3
echo "── daily-report enviados ──"
grep -hE "^2026-09-0[4-9]" /root/.pm2/logs/maria-paez-out.log | grep -i "daily-report" | tail -3
ls -la /root/secretaria/state/daily-report* 2>/dev/null | tail -3
echo "── pm2 ──"
pm2 jlist 2>/dev/null | python3 -c "import json,sys,time;[print(' ',p['name'],p['pm2_env']['status'],'restarts',p['pm2_env']['restart_time'],'uptime_h',int((time.time()*1000-p['pm2_env']['pm_uptime'])//3600000)) for p in json.load(sys.stdin)]"
df -h / | tail -1; free -m | head -2 | tail -1
echo LISTO
