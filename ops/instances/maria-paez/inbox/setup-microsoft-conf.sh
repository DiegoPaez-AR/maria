#!/bin/bash
# Setea las MS_* en el .conf real de maria-paez.conf si no están ya.
set -e
CONF="/root/secretaria/config/instances/maria-paez.conf"

if grep -q "^MS_CLIENT_ID=" "$CONF"; then
  echo "MS_CLIENT_ID ya está seteado en el .conf — no hago nada"
  grep -E '^MS_' "$CONF"
else
  echo "═══ Agregando MS_* al .conf ═══"
  cat >> "$CONF" <<'CONF_EOF'

# Microsoft Graph (Fase 2)
MS_CLIENT_ID=21951130-ee8d-41c1-b3a6-2cf92437a6e7
MS_TENANT=common
MS_REDIRECT_URI=http://localhost/maria-oauth-callback
CONF_EOF
  echo "Agregado:"
  grep -E '^MS_' "$CONF"
fi

echo ""
echo "═══ Reload pm2 con env nuevo ═══"
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -3
sleep 5

echo ""
echo "═══ Smoke test: provider microsoft carga y ve las env vars ═══"
cd /root/secretaria && MS_CLIENT_ID="$(grep '^MS_CLIENT_ID=' "$CONF" | cut -d= -f2-)" \
  MS_TENANT="$(grep '^MS_TENANT=' "$CONF" | cut -d= -f2-)" \
  MS_REDIRECT_URI="$(grep '^MS_REDIRECT_URI=' "$CONF" | cut -d= -f2-)" \
  node -e "
const ms = require('./providers/microsoft');
console.log('exports:', Object.keys(ms).slice(0,12).join(', '));
const pair = ms.nuevoPkcePair();
console.log('PKCE verifier len:', pair.verifier.length, 'challenge len:', pair.challenge.length);
const url = ms.buildAuthUrl({ state: 'test123', codeChallenge: pair.challenge, loginHint: 'foo@outlook.com' });
console.log('Auth URL prefix:', url.slice(0, 120) + '...');
console.log('client_id en URL?', url.includes('client_id=21951130'));
console.log('scopes en URL?', url.includes('Calendars.ReadWrite') && url.includes('offline_access'));
"

echo ""
echo "═══ Verificación providers/index ═══"
cd /root/secretaria && node -e "
const p = require('./providers');
console.log('forUser/forMaria:', Object.keys(p).join(','));
" 2>&1

echo ""
echo "═══ Healthcheck post-reload ═══"
bash /root/secretaria/ops/healthcheck.sh | python3 -c 'import sys,json; d=json.load(sys.stdin); print("overall_ok:", d["overall_ok"]); print("checks:", {k:v["ok"] for k,v in d["checks"].items()})'
