#!/bin/bash
cd /root/secretaria
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK"
env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL -u SEC_DESTINATARIO_STRICT \
  npm test 2>&1 | grep -E "^# (tests|pass|fail)|^not ok" 
echo "FIN"
