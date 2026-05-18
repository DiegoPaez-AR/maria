#!/bin/bash
echo "═══ Redeploy intensa.io con toggle EN|ES + cache-bust ═══"
bash /root/secretaria/ops/sites/intensa.io/deploy.sh

echo ""
echo "═══ Verificar HTML deployado tiene cache-bust ═══"
grep -E "script\.js|styles\.css" /var/www/intensa.io/index.html

echo ""
echo "═══ ¿toggle EN|ES en HTML? ═══"
grep "lang-btn\|lang-flag" /var/www/intensa.io/index.html | head -5

echo ""
echo "═══ ¿translations en script.js? ═══"
grep -c "translations\|applyTranslations\|lang-btn" /var/www/intensa.io/script.js

echo ""
echo "═══ Smoke HTTPS ═══"
curl -sk -H "Host: intensa.io" -o /dev/null -w "intensa.io     HTTPS %{http_code}\n" https://127.0.0.1/
curl -sk -H "Host: www.intensa.io" -o /dev/null -w "www.intensa.io HTTPS %{http_code}\n" https://127.0.0.1/
