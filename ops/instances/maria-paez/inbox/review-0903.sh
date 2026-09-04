#!/bin/bash
cd /root/secretaria
for S in maria-paez sofia-bruscoli; do
  DB=/root/secretaria/state/$S/db/maria.sqlite
  echo "════════ $S ════════"
  echo "── eventos de ayer por canal/dirección ──"
  sqlite3 "$DB" "select canal,direccion,count(*) from eventos where date(timestamp,'-3 hours')='2026-09-03' group by 1,2" 2>&1
  echo "── quién habló (inbound) ──"
  sqlite3 "$DB" "select coalesce(u.nombre,e.de) quien, e.canal, count(*) from eventos e left join usuarios u on u.id=e.usuario_id where date(e.timestamp,'-3 hours')='2026-09-03' and e.direccion='in' group by 1,2 order by 3 desc" 2>&1 | head -15
  echo "── pm2 error.log ayer (agrupado) ──"
  grep -h "^2026-09-03" /root/.pm2/logs/$S-error.log 2>/dev/null | sed 's/^[0-9-]* [0-9:]*: //' | cut -c1-90 | sort | uniq -c | sort -rn | head -12
  echo "── out.log: warn/error/fallo ──"
  grep -h "^2026-09-03" /root/.pm2/logs/$S-out.log | grep -iE "warn|error|fall[oó]|descart|abort|timeout|409|429|reintento" | sed 's/^[0-9-]* [0-9:]*: //' | cut -c1-100 | sort | uniq -c | sort -rn | head -15
  echo "── wa_outbox ayer ──"
  sqlite3 "$DB" "select estado,count(*) from wa_outbox where date(creado,'-3 hours')='2026-09-03' group by 1" 2>&1
done
echo "════════ Noelia / Telegram ════════"
sqlite3 /root/secretaria/state/sofia-bruscoli/db/maria.sqlite "select id,nombre,telegram_chat_id,email,wa_cus from usuarios" 2>&1
sqlite3 /root/secretaria/state/sofia-bruscoli/db/maria.sqlite "select datetime(timestamp,'-3 hours'),canal,direccion,de,substr(cuerpo,1,120) from eventos where canal!='sistema' order by timestamp desc limit 12" 2>&1
grep -h "^2026-09-0[34]" /root/.pm2/logs/sofia-bruscoli-out.log | grep -iE "gmail|TG\]|wa-hook|vincul" | tail -10 | cut -c1-160
echo "── anti-loop bot↔bot ──"
grep -rn -iE "bucle|ping-pong|Auto-Submitted|autoresponder|otra asistente|otro asistente" --include=*.js . | grep -v node_modules | cut -c1-140 | head -8
echo LISTO
