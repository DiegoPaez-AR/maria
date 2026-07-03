#!/bin/bash
cd /root/secretaria
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' config/secrets.conf | cut -d= -f2- | tr -d '"')
echo "token en archivo: len=${#TOKEN}"
R=$(curl -s -m 10 "https://api.telegram.org/bot$TOKEN/getMe")
echo "getMe → $(echo "$R" | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('result',{}); print('ok:', d.get('ok'), '| bot: @'+str(r.get('username')), '|', r.get('first_name'))")"
UNAME=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin).get('result',{}).get('username') or '')")
# guardar el username para las instrucciones de vinculación (no es secreto,
# pero secrets.conf es el lugar canónico que se mergea al env)
if [ -n "$UNAME" ] && ! grep -q '^TELEGRAM_BOT_USERNAME=' config/secrets.conf; then
  printf '\n# ── TELEGRAM_BOT_USERNAME (no-secreto; para las instrucciones de vincular_telegram) ──\nTELEGRAM_BOT_USERNAME=%s\n' "$UNAME" >> config/secrets.conf
  echo "TELEGRAM_BOT_USERNAME=$UNAME agregado a secrets.conf"
fi
# ¿el proceso tiene el token NUEVO? comparar env vivo vs archivo
MATCH=$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
v='$TOKEN'
for p in json.load(sys.stdin):
    if p['name']=='maria-paez':
        e=p['pm2_env']; env={**e, **(e.get('env') or {})}
        print('MATCH' if env.get('TELEGRAM_BOT_TOKEN')==v else 'VIEJO')
")
echo "env vivo: $MATCH"
if [ "$MATCH" != "MATCH" ]; then
  pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
  echo "reload disparado (token nuevo + username)"
  sleep 8
fi
grep -E "arrancando telegram|\[TG\]" ~/.pm2/logs/maria-paez-out.log | tail -2
echo LISTO
