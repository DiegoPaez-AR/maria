#!/bin/bash
cd /root/secretaria
echo "── WA llegó a ready? ──"
pm2 logs maria-paez --lines 60 --nostream 2>/dev/null | grep -E "WA ready|WA authenticated|QR|error" | tail -5
echo ""
echo "── detalle del fallo de tests ──"
env -u MARIA_DB -u MARIA_VAULT_KEY -u OWNER_NOMBRE -u OWNER_WA -u OWNER_EMAIL -u SEC_DESTINATARIO_STRICT \
  npm test 2>&1 | head -40
