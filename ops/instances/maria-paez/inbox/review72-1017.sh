#!/bin/bash
# Solo lectura: revisión profunda 72h (14/10 11:00 → 17/10 11:00 ART) de maria-paez y sofia-bruscoli
cd /root/secretaria
DESDE_UTC='2026-10-14 14:00:00'; DESDE_LOG='2026-10-14 11:00'
W42=ops/instances/maria-paez/reviews/2026-W42.md; W42S=ops/instances/sofia-bruscoli/reviews/2026-W42.md
had=0; [ -f $W42 ] && had=1
echo "████ weekly-review --dias 3 ████"
timeout 120 node ops/scripts/weekly-review.js --dias 3 --no-mail >/dev/null 2>&1; echo "exit=$?"
cat ops/instances/weekly-review-ultima.md
git checkout -q -- ops/instances/weekly-review-ultima.md 2>/dev/null
[ $had = 0 ] && rm -f $W42 $W42S || git checkout -q -- $W42 $W42S 2>/dev/null
for s in maria-paez sofia-bruscoli; do
  echo; echo "████████ $s ████████"
  ( set -a; . config/instances/$s.conf; [ -f config/secrets.conf ] && . config/secrets.conf; set +a
    echo "── conversación completa (sin telemetría) ──"
    sqlite3 -separator ' │ ' "$MARIA_DB" "select e.id, datetime(e.timestamp,'-3 hours'), e.canal, e.direccion, coalesce(u.nombre, e.nombre, e.de, ''), replace(substr(e.cuerpo,1,1500),char(10),' ⏎ ') from eventos e left join usuarios u on u.id=e.usuario_id where e.timestamp>='$DESDE_UTC' and e.cuerpo not like 'claude_call%' and e.cuerpo not like 'poda-eventos%' order by e.id;"
    echo "── acciones fallidas / errores con metadata ──"
    sqlite3 -separator ' │ ' "$MARIA_DB" "select id, datetime(timestamp,'-3 hours'), substr(cuerpo,1,200), substr(coalesce(metadata_json,''),1,600) from eventos where timestamp>='$DESDE_UTC' and canal='sistema' and (cuerpo like '%fall%' or cuerpo like '%error%' or cuerpo like '%abort%' or cuerpo like '%descart%' or cuerpo like '%⚠%') order by id;"
    echo "── claude_call: tipo, n, ms prom, max ──"
    sqlite3 "$MARIA_DB" "select substr(cuerpo,13,instr(substr(cuerpo,13),':')-1) t, count(*), cast(avg(cast(substr(cuerpo, instr(cuerpo,': ')+2, instr(cuerpo,'ms')-instr(cuerpo,': ')-2) as int)) as int) from eventos where timestamp>='$DESDE_UTC' and cuerpo like 'claude_call%' group by 1 order by 2 desc;"
    echo "── wa_outbox 72h ──"
    sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, intentos, numero, datetime(creado,'-3 hours'), datetime(entregado,'-3 hours'), replace(substr(texto,1,300),char(10),' '), substr(coalesce(metadata_json,''),1,400) from wa_outbox where creado>='$DESDE_UTC' order by id;"
    echo "── pendientes creados/cerrados 72h ──"
    sqlite3 -separator ' │ ' "$MARIA_DB" "select id, estado, dueno, disparador, datetime(creado,'-3 hours'), datetime(cerrado,'-3 hours'), substr(\"desc\",1,200) from pendientes where creado>='$DESDE_UTC' or cerrado>='$DESDE_UTC' order by id;"
    echo "── follow_ups 72h ──"
    sqlite3 -separator ' │ ' "$MARIA_DB" "select * from follow_ups where creado>='$DESDE_UTC' or estado in ('abierto','disparado') order by id desc limit 20;" 2>&1 | cut -c1-500
    echo "── programados 72h ──"
    sqlite3 -separator ' │ ' "$MARIA_DB" "select * from programados where creado>='$DESDE_UTC' order by id;" 2>&1 | cut -c1-400
  )
  echo "── out.log 72h (sin 'al día', sin MB upd) ──"
  awk -v d="$DESDE_LOG" '($3" "substr($4,1,5))>=d' logs/$s/out.log | grep -v -E "al día|\[upd\]" | cut -c1-500 | tail -400
  echo "── error.log 72h agrupado ──"
  awk -v d="$DESDE_LOG" '($3" "substr($4,1,5))>=d' logs/$s/error.log | cut -d' ' -f5- | sed -E 's/[0-9]{3,}/N/g' | sort | uniq -c | sort -rn | head -30
  echo "── error.log 72h últimas 40 crudas (sin TG poll) ──"
  awk -v d="$DESDE_LOG" '($3" "substr($4,1,5))>=d' logs/$s/error.log | grep -v "TG\] poll" | tail -40 | cut -c1-500
done
echo; echo "── pm2 ──"; pm2 jlist 2>/dev/null | python3 -c "import json,sys,time;[print(p['name'],p['pm2_env']['status'],'restarts',p['pm2_env']['restart_time'],'up_h',round((time.time()*1000-p['pm2_env']['pm_uptime'])/3.6e6,1),'mem_MB',round(p['monit']['memory']/1e6)) for p in json.load(sys.stdin)]"
echo "── disco/mem ──"; df -h / | tail -1; free -m | head -2
