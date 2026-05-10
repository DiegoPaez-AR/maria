#!/bin/bash
set +e
cd /root/secretaria

echo "── env actual del proceso (antes) ──"
pm2 jlist | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name']!='maria-paez': continue
    e = p['pm2_env']
    for k in ['ASISTENTE_NOMBRE','ASISTENTE_SLUG','MARIA_DB','GOOGLE_CRED_PATH','GOOGLE_TOKEN_PATH','WA_AUTH_DIR','OWNER_EMAIL','OWNER_NOMBRE','OWNER_WA']:
        print(f'  {k} = {e.get(k, \"<NOT SET>\")}')
"
echo

echo "── pm2 reload ecosystem.config.js (re-lee el .conf) ──"
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -10
echo

echo "── env actual (después) ──"
pm2 jlist | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name']!='maria-paez': continue
    e = p['pm2_env']
    for k in ['ASISTENTE_NOMBRE','ASISTENTE_SLUG','MARIA_DB','GOOGLE_CRED_PATH','GOOGLE_TOKEN_PATH','WA_AUTH_DIR','OWNER_EMAIL','OWNER_NOMBRE','OWNER_WA']:
        print(f'  {k} = {e.get(k, \"<NOT SET>\")}')
"
echo

echo "── pm2 list final ──"
pm2 list 2>&1 | head -7
