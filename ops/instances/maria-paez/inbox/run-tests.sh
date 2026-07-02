#!/bin/bash
cd /root/secretaria
echo "node $(node --version)"
# env limpio: los tests setean su propio MARIA_DB/VAULT_KEY/OWNER_* — deshacemos
# los del .conf que inyecta cron-master para no tocar NADA real.
env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL -u SEC_DESTINATARIO_STRICT \
  npm test 2>&1 | tail -25
echo "exit=$?"
