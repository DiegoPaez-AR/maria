#!/bin/bash
set -uo pipefail

echo "── 1. pm2 list ──"
pm2 list 2>&1 | head -20

echo
echo "── 2. procesos claude colgados ──"
ps -eo pid,etime,cmd | grep -E "claude" | grep -v grep | head -10

echo
echo "── 3. claude CLI ping mínimo (timeout 60s) ──"
timeout 60 claude -p "Devolveme literal la palabra PONG, nada más" 2>&1 | head -20
echo "exit: $?"

echo
echo "── 4. claude /status ──"
timeout 30 claude /status 2>&1 | head -20

echo
echo "── 5. últimos 5 eventos del usuario_id=1 post-10:40 ──"
cd /root/secretaria
DB="$MARIA_DB"
sqlite3 -separator '|' "$DB" "
  SELECT datetime(timestamp,'localtime') as ts, canal, direccion, substr(cuerpo,1,200) as cuerpo
  FROM eventos
  WHERE usuario_id=1 AND datetime(timestamp,'localtime') >= '2026-05-26 10:40'
  ORDER BY timestamp DESC LIMIT 15;
"
