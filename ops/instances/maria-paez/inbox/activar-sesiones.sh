#!/bin/bash
# inbox: activa sesiones persistentes en maria-paez (MARIA_SESIONES=1)
set -u
CONF=/root/secretaria/config/instances/maria-paez.conf
grep -v -E '^MARIA_SESIONES=' "$CONF" > "$CONF.tmp" && echo 'MARIA_SESIONES=1' >> "$CONF.tmp" && mv "$CONF.tmp" "$CONF"
grep MARIA_SESIONES "$CONF"
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -2
sleep 3
pm2 jlist | python3 -c "
import json, sys
for p in json.load(sys.stdin):
    if p.get('name') == 'maria-paez':
        print('status:', p.get('pm2_env', {}).get('status'))
"
