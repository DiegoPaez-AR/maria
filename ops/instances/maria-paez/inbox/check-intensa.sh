#!/bin/bash
echo "═══ ¿precios en /var/www/intensa.io/index.html? ═══"
grep -c "PRICING\|pricing-grid\|Precios.*Sin sorpresas" /var/www/intensa.io/index.html

echo ""
echo "═══ ¿link Precios en nav? ═══"
grep -c 'href="#precios"' /var/www/intensa.io/index.html

echo ""
echo "═══ ¿toggle bandera? ═══"
grep -c "lang-toggle\|lang-flag" /var/www/intensa.io/index.html

echo ""
echo "═══ ¿translations en script.js? ═══"
grep -c "translations\|applyTranslations" /var/www/intensa.io/script.js

echo ""
echo "═══ ¿CSS toggle? ═══"
grep -c ".lang-toggle\|.lang-flag" /var/www/intensa.io/styles.css

echo ""
echo "═══ tamaños actuales ═══"
ls -la /var/www/intensa.io/

echo ""
echo "═══ HTTPS test local ═══"
curl -sk -o /dev/null -w "intensa.io       %{http_code}\n" -H "Host: intensa.io" https://127.0.0.1/
curl -sk -o /dev/null -w "www.intensa.io   %{http_code}\n" -H "Host: www.intensa.io" https://127.0.0.1/
curl -sk -o /dev/null -w "veritas-trace    %{http_code}\n" -H "Host: www.veritas-trace.com" https://127.0.0.1/
