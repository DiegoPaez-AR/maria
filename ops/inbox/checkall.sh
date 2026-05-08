#!/bin/bash
set +e
echo "── pm2 list ──"
pm2 list 2>&1 | head -10
echo
echo "── últimos eventos clave (auth, ready, qr, error, brief, mensajes) ──"
pm2 logs maria --lines 1500 --nostream 2>&1 | grep -E 'change_state|authenticated|ready|qr\] escan|disconnected|invalid_grant|Error|claude exit|brief|WA ←|WA →usr|WA →3ro|GMAIL ←|frame muerto|SIGINT|iniciando' | tail -40
echo
echo "── últimas 15 líneas del log (estado actual) ──"
pm2 logs maria --lines 15 --nostream 2>&1 | tail -20
echo
echo "── chequeo express del token de Google ──"
node -e "
const fs = require('fs');
try {
  const t = JSON.parse(fs.readFileSync('/root/secretaria/token.json','utf8'));
  console.log('token.json keys:', Object.keys(t));
  console.log('expiry_date:', t.expiry_date, '(now:', Date.now(), ')');
  console.log('refresh_token presente?:', !!t.refresh_token);
} catch(e) {
  console.log('error leyendo token:', e.message);
}
"
