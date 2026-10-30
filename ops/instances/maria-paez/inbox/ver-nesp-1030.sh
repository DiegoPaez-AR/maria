#!/bin/bash
# Solo lectura: ¿contestó Nespresso AR? ¿se descartó algo? ¿recargó el código?
cd /root/secretaria; sleep 15
git log --format='%h %s' -1; grep -c "_cubre" wa-hook.js
pm2 jlist | python3 -c "import json,sys,time;[print(p['name'],p['pm2_env']['status'],p['pm2_env']['restart_time'],round((time.time()*1000-p['pm2_env']['pm_uptime'])/1000),'s') for p in json.load(sys.stdin) if p['name'] in ('maria-paez','sofia-bruscoli')]"
( set -a; . config/instances/maria-paez.conf; set +a
  sqlite3 -separator ' │ ' "$MARIA_DB" "select id, datetime(timestamp,'-3 hours'), canal, direccion, coalesce(nombre,de,''), replace(substr(cuerpo,1,400),char(10),' ⏎ ') from eventos where timestamp >= '2026-10-30 11:45' and cuerpo not like 'claude_call%' order by id;" )
grep -E "^2026-10-30 08:(4[5-9]|5)" logs/maria-paez/out.log | grep -i -E "nespresso|wa-hook|notif\] entrante|descart" | cut -c1-250
