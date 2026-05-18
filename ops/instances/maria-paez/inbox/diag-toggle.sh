#!/bin/bash
echo "═══ ¿el index.html servido tiene data-i18n? ═══"
grep -c "data-i18n" /var/www/intensa.io/index.html

echo ""
echo "═══ ¿script.js tiene translations + applyTranslations? ═══"
grep -c "translations\|applyTranslations" /var/www/intensa.io/script.js

echo ""
echo "═══ Primeras 5 lineas del toggle button en HTML ═══"
grep -A 4 "langToggle" /var/www/intensa.io/index.html

echo ""
echo "═══ Lineas 1-15 del script.js (header + translations) ═══"
head -15 /var/www/intensa.io/script.js

echo ""
echo "═══ ¿hay errores en sintaxis del script.js? ═══"
node -c /var/www/intensa.io/script.js 2>&1 && echo "sintaxis OK" || echo "sintaxis FALLÓ"

echo ""
echo "═══ Lineas del DOMContentLoaded ═══"
grep -A 2 "DOMContentLoaded\|langToggle" /var/www/intensa.io/script.js | head -20
