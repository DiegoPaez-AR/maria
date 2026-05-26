#!/bin/bash
# Genera la URL OAuth de Google para reautorizar Maria.
# El cron-master.sh ya carga el env del .conf antes de invocar este script,
# así que GOOGLE_CRED_PATH / GOOGLE_TOKEN_PATH / MARIA_VAULT_KEY están seteados.
set -euo pipefail
cd /root/secretaria
echo "─── auth-gmail.js url ───"
node auth-gmail.js url
echo "─── fin ───"
