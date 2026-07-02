#!/bin/bash
cd /root/secretaria
env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL -u SEC_DESTINATARIO_STRICT \
  npm test 2>&1 | grep -B2 -A25 "^not ok" | head -60
echo "FIN"
