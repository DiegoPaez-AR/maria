#!/bin/bash
set +e
echo "== sitekey servido en /var/www (signup) =="
grep -oE 'data-sitekey="[^"]*"' /var/www/intensa.io/maria/signup/index.html 2>/dev/null
grep -c 'challenges.cloudflare.com/turnstile' /var/www/intensa.io/maria/signup/index.html 2>/dev/null && echo "(script turnstile presente si >=1)"
echo ""
echo "== sitekey en el repo (para comparar) =="
grep -oE 'data-sitekey="[^"]*"' /root/secretaria/ops/sites/intensa.io/maria/signup/index.html 2>/dev/null
echo ""
echo "== TURNSTILE en .env-intensa-api (presencia, enmascarado) =="
grep -iE 'TURNSTILE' /root/secretaria/.env-intensa-api 2>/dev/null | sed -E 's/(=.{6}).*/\1…(oculto)/'
echo ""
echo "== intensa-api está corriendo? =="
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'],p['pm2_env'].get('status')) for p in json.load(sys.stdin) if p['name']=='intensa-api']" 2>/dev/null
