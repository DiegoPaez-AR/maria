#!/bin/bash
# Re-arrancar maria-paez con ecosystem.config.js para que tome el env del .conf.
set +e
cd /root/secretaria || exit 1

echo "═══ ANTES — pm2 env actual ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {}).get('env', {})
    for k in ['MARIA_DB','MARIA_STATE_DIR','GOOGLE_CRED_PATH','WA_AUTH_DIR','ASISTENTE_SLUG','OWNER_EMAIL']:
        print(f'  {k}={e.get(k)}')
"

echo ""
echo "═══ pm2 delete maria-paez ═══"
pm2 delete maria-paez 2>&1 | tail -5

echo ""
echo "═══ pm2 start ecosystem.config.js --only maria-paez ═══"
pm2 start ecosystem.config.js --only maria-paez 2>&1 | tail -20

echo ""
echo "═══ pm2 save ═══"
pm2 save 2>&1 | tail -5

echo ""
echo "═══ DESPUÉS — env del proceso nuevo ═══"
sleep 3
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {})
    env = e.get('env', {})
    print(f'  pid={p.get(\"pid\")} status={e.get(\"status\")} restarts={e.get(\"restart_time\")}')
    for k in ['MARIA_DB','MARIA_STATE_DIR','GOOGLE_CRED_PATH','WA_AUTH_DIR','ASISTENTE_SLUG','OWNER_EMAIL']:
        print(f'  {k}={env.get(k)}')
"

echo ""
echo "═══ Logs primeros ~25s después del arranque ═══"
sleep 25
pm2 logs maria-paez --lines 150 --nostream 2>&1 | tail -150
