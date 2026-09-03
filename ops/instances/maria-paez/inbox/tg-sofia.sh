#!/bin/bash
cd /root/secretaria
TOK='8468695892:AAGgHTP9zAcSqbOztBJ4hzVU7fwjKpBlfik'
echo "── ¿el token es válido? (getMe) ──"
ME=$(curl -s -m 15 "https://api.telegram.org/bot$TOK/getMe")
echo "$ME" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  ok:', d.get('ok'), '| bot:', d.get('result',{}).get('first_name'), '| username: @'+str(d.get('result',{}).get('username')))"
USR=$(echo "$ME" | python3 -c "import json,sys; print(json.load(sys.stdin).get('result',{}).get('username',''))")
if [ -z "$USR" ]; then echo "  token inválido — no toco nada"; echo LISTO; exit 0; fi
echo "── al .conf de SOFIA (per-instance) ──"
CF=config/instances/sofia-bruscoli.conf
sed -i '/^TELEGRAM_BOT_TOKEN=/d;/^TELEGRAM_BOT_USERNAME=/d' "$CF"
echo "TELEGRAM_BOT_TOKEN=$TOK" >> "$CF"
echo "TELEGRAM_BOT_USERNAME=$USR" >> "$CF"
grep -c '^TELEGRAM_' "$CF"
echo "── reload sofia ──"
timeout 90 pm2 reload ecosystem.config.js --only sofia-bruscoli --update-env >/dev/null 2>&1 && echo "  reload OK"
sleep 20
timeout 10 grep -E "telegram|TG\]" /root/.pm2/logs/sofia-bruscoli-out.log | tail -3
timeout 10 tail -3 /root/.pm2/logs/sofia-bruscoli-error.log
echo LISTO
