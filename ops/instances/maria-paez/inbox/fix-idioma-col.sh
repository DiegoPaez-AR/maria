#!/bin/bash
set +e
CTRL=/root/secretaria/state/control/control.sqlite
echo "== columnas signup_pending ANTES =="
sqlite3 "$CTRL" "PRAGMA table_info(signup_pending);" | awk -F'|' '{print $2}' | tr '\n' ' '; echo
echo "== ALTER add idioma (si falta) =="
sqlite3 "$CTRL" "ALTER TABLE signup_pending ADD COLUMN idioma TEXT NOT NULL DEFAULT 'es';" 2>&1
echo "== columnas DESPUES =="
sqlite3 "$CTRL" "PRAGMA table_info(signup_pending);" | grep -i idioma && echo "OK idioma presente"
echo ""
echo "== restart DURO de intensa-api (re-corre db.init con código nuevo) =="
cd /root/secretaria && pm2 delete intensa-api 2>&1 | tail -1; pm2 start ecosystem.config.js --only intensa-api 2>&1 | tail -2
sleep 2
echo "== health intensa-api =="
curl -s -m 5 http://127.0.0.1:4080/maria/api/health 2>/dev/null || curl -s -m 5 http://127.0.0.1:4080/health 2>/dev/null; echo
pm2 jlist 2>/dev/null | python3 -c "import json,sys;[print(p['name'],p['pm2_env'].get('status')) for p in json.load(sys.stdin) if p['name']=='intensa-api']" 2>/dev/null
echo "== verif código nuevo: codes.js tiene idiomaN? =="
grep -c "idiomaN" /root/secretaria/ops/backend/intensa-api/lib/codes.js
