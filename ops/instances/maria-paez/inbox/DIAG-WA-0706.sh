#!/bin/bash
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "== hora VPS =="; date
echo; echo "== ultimos 8 eventos =="
sqlite3 "$DB" "SELECT id, timestamp, canal, direccion, substr(replace(cuerpo,char(10),' '),1,90) FROM eventos ORDER BY id DESC LIMIT 8;"
echo; echo "== ultimo WA entrante =="
sqlite3 "$DB" "SELECT id, timestamp, de, substr(replace(cuerpo,char(10),' '),1,80) FROM eventos WHERE canal='whatsapp' AND direccion='entrante' ORDER BY id DESC LIMIT 3;"
echo; echo "== markers / estado =="
ls -la /root/secretaria/state/maria-paez/ | grep -iv "^d.*\.$" | head -20
ls /root/secretaria/state/maria-paez/.wwebjs_auth/ 2>/dev/null
echo; echo "== pm2 err log (ultimas 30) =="
tail -30 /root/.pm2/logs/maria-paez-error.log 2>/dev/null
echo; echo "== out log: ready/auth/disconnect/qr =="
grep -i "ready\|authenticated\|disconnect\|qr\|change_state\|CONFLICT" /root/.pm2/logs/maria-paez-out.log 2>/dev/null | tail -15
