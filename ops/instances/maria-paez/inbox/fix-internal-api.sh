#!/bin/bash
set +e
echo "═══ 1. Verificar .env-intensa-api tiene Turnstile keys ═══"
grep -E "^TURNSTILE" /root/secretaria/.env-intensa-api | sed 's/=.*/=***/'

echo
echo "═══ 2. pm2 delete intensa-api + start fresh (forzar re-lectura del .env) ═══"
pm2 delete intensa-api 2>&1 | tail -3
pm2 start /root/secretaria/ecosystem.config.js --only intensa-api 2>&1 | tail -3
pm2 save 2>&1 | tail -2
sleep 5

echo
echo "═══ 3. Verificar env real cargado en pm2 ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name'] == 'intensa-api':
        env = p['pm2_env']
        print(f\"  TURNSTILE_SITE_KEY = {env.get('TURNSTILE_SITE_KEY','(no seteado)')[:18]}…\" if env.get('TURNSTILE_SITE_KEY') else '  TURNSTILE_SITE_KEY = (no seteado)')
        print(f\"  TURNSTILE_SECRET_KEY = {(env.get('TURNSTILE_SECRET_KEY','') or '(no)')[:18]}…\")
        print(f\"  LEMON_WEBHOOK_SECRET = {(env.get('LEMON_WEBHOOK_SECRET','') or '(no)')[:12]}…\")
        print(f\"  pid={p['pid']}\")
"

echo
echo "═══ 4. Maria pm2 reload (para tomar el fix de internal-api con google.enviarEmail) ═══"
pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -3
sleep 8

echo
echo "═══ 5. Smoke test del internal-api (send-email a casilla real con un código fake) ═══"
INTERNAL_SECRET=$(grep '^ASISTENTE_INTERNAL_SECRET=' /root/secretaria/config/instances/maria-paez.conf | cut -d= -f2- | tr -d '"')
echo "  send-email a diego@paez.is:"
curl -s -X POST -H "Content-Type: application/json" -H "X-Intensa-Secret: $INTERNAL_SECRET" \
  -d '{"to":"diego@paez.is","subject":"[Maria test] verificación de mailing","html":"<p>Soy María. Si te llegó este mail, el internal-api send-email anda 👋</p>"}' \
  http://127.0.0.1:4501/send-email
echo
echo "  send-wa al WA de Diego:"
curl -s -X POST -H "Content-Type: application/json" -H "X-Intensa-Secret: $INTERNAL_SECRET" \
  -d '{"to":"5491132317896","body":"[María test internal-api] Si te llegó este mensaje, send-wa anda."}' \
  http://127.0.0.1:4501/send-wa
echo

echo
echo "═══ 6. Logs intensa-api post-restart ═══"
pm2 logs intensa-api --lines 30 --nostream 2>&1 | tail -15

echo
echo "═══ DONE ═══"
