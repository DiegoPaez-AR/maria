#!/bin/bash
set +e
echo "== 1. deploy.sh (web signup con idioma) =="
bash /root/secretaria/ops/sites/intensa.io/deploy.sh 2>&1 | grep -iE "signup|done|HTTPS 200|error|reload nginx" | head
grep -c "idioma: lang" /var/www/intensa.io/maria/signup/script.js && echo "(script.js servido manda idioma)"
echo ""
echo "== 2. reload intensa-api (aplica migración signup_pending.idioma + código nuevo) =="
cd /root/secretaria && pm2 reload ecosystem.config.js --only intensa-api --update-env 2>&1 | tail -3
sleep 2
echo "== 3. verif control DB: columna idioma en signup_pending =="
sqlite3 /root/secretaria/state/control/control.sqlite "PRAGMA table_info(signup_pending);" 2>/dev/null | grep -i idioma || echo "(NO está la columna idioma!)"
echo "== intensa-api health + status =="
pm2 jlist 2>/dev/null | python3 -c "import json,sys;[print(p['name'],p['pm2_env'].get('status'),'restarts='+str(p['pm2_env'].get('restart_time'))) for p in json.load(sys.stdin) if p['name'] in ('intensa-api','maria-paez')]" 2>/dev/null
echo ""
echo "== 4. WA ready tras el reboot 23:17? =="
pm2 logs maria-paez --lines 80 --nostream 2>/dev/null | grep -iE "23:1[789]|23:2|WA ready|WA qr|WA authenticated" | tail -6
