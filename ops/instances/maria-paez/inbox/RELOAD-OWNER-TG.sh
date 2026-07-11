#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== túnel =="
IP=$(curl -s -m 10 --socks5 127.0.0.1:1080 https://api.ipify.org || echo FALLO)
echo "egreso socks5: $IP"
echo "== owner TG =="
sqlite3 "$DB" "SELECT id, nombre, telegram_chat_id, email FROM usuarios WHERE rol='owner';"
echo "== restart (Chromium colgado desde ayer 14:25) =="
cd /root/secretaria && pm2 restart maria-paez --update-env >/dev/null 2>&1
sleep 10
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
grep -c "callFunctionOn timed out" /root/secretaria/whatsapp-handler.js
grep -c "_reruteoOwner" /root/secretaria/wa-send.js
