#!/bin/bash
# inbox: reinicia intensa-api para tomar el OTP de /update /cancel (la
# migracion de la columna proposito corre en init()).
set -u
pm2 restart intensa-api 2>&1 | tail -2
sleep 3
pm2 jlist | python3 -c "
import json, sys
for p in json.load(sys.stdin):
    if p.get('name') == 'intensa-api':
        print('intensa-api:', p.get('pm2_env', {}).get('status'))
"
