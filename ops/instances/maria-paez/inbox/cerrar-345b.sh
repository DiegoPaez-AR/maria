#!/bin/bash
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
sqlite3 "$DB" "update pendientes set estado='cerrado', cerrado=CURRENT_TIMESTAMP where id=345 and estado='abierto'"
sqlite3 "$DB" "select id,estado,datetime(cerrado,'-3 hours') from pendientes where id=345"
sqlite3 "$DB" "select id,estado from follow_ups where id in (68,70)"
pm2 jlist | python3 -c "import json,sys,time;[print(' ',p['name'],'up',int((time.time()*1000-p['pm2_env']['pm_uptime'])//60000),'min') for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo LISTO
