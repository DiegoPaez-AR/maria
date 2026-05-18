#!/bin/bash
echo "STARTING SCRIPT"
echo "═══ PWD: $(pwd) ═══"
echo "═══ env vars relevantes ═══"
echo "MARIA_DB=$MARIA_DB"
echo "ASISTENTE_SLUG=$ASISTENTE_SLUG"
echo ""
echo "═══ files en /var/www/intensa.io ═══"
ls -la /var/www/intensa.io/ 2>&1
echo ""
echo "═══ HTML head + nav (primeras 30 lineas) ═══"
head -30 /var/www/intensa.io/index.html
echo ""
echo "═══ ¿precios? ═══"
grep -c "precios\|PRICING\|pricing-grid" /var/www/intensa.io/index.html
echo ""
echo "═══ ¿toggle? ═══"
grep -c "lang-toggle" /var/www/intensa.io/index.html
echo ""
echo "ENDING SCRIPT"
