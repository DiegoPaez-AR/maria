#!/bin/bash
cd /root/secretaria
grep -E "canary (OK|FALLÓ)" ops/.cron.log | tail -1
env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL -u SEC_DESTINATARIO_STRICT \
  npm test 2>&1 | grep -E "^# (tests|pass|fail)"
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo LISTO
