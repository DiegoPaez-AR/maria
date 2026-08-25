#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
echo "── estado de Telegram AHORA ──"
timeout 20 grep -E "\[TG\]" /root/.pm2/logs/maria-paez-out.log | tail -8
timeout 15 grep -E "\[TG\]" /root/.pm2/logs/maria-paez-error.log | tail -6
echo ""
echo "── el aviso que salió (evento) ──"
timeout 20 python3 -c "
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute(\"SELECT timestamp,canal,substr(cuerpo,1,300) c, metadata_json m FROM eventos WHERE timestamp >= '2026-08-24 21:00' AND (cuerpo LIKE '%telegram_polling%' OR cuerpo LIKE '%fetch failed%' OR json_extract(metadata_json,'\$.tipo') LIKE '%loop%') ORDER BY timestamp\"):
    print(' ',r['timestamp'],r['canal'],'|',(r['c'] or '').replace(chr(10),' ⏎ '))
db.close()"
echo ""
echo "── último poll OK de TG (¿se recuperó?) ──"
timeout 15 grep -E "poll recuperado|entrante" /root/.pm2/logs/maria-paez-out.log | grep -iE "TG|telegram" | tail -4
echo LISTO
