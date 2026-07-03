#!/bin/bash
cd /root/secretaria
echo "── arranque TG en logs ──"
grep -E "telegram-handler|TELEGRAM_BOT_TOKEN|\[TG\]" ~/.pm2/logs/maria-paez-out.log | tail -4
echo "── token en env vivo ──"
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    if p['name']=='maria-paez':
        e=p['pm2_env']; env={**e, **(e.get('env') or {})}
        t=env.get('TELEGRAM_BOT_TOKEN','')
        print('TELEGRAM_BOT_TOKEN:', 'presente len='+str(len(t)) if t else 'AUSENTE')
"
echo "── getMe contra la API (identidad del bot, sin exponer token) ──"
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' config/secrets.conf | cut -d= -f2- | tr -d '"')
[ -z "$TOKEN" ] && echo "token NO está en secrets.conf" || curl -s -m 10 "https://api.telegram.org/bot$TOKEN/getMe" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',{}); print('ok:', d.get('ok'), '| bot: @'+str(r.get('username')), '|', r.get('first_name'))"
echo LISTO
