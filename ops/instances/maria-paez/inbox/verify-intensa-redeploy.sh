#!/bin/bash
set +e
echo "═══ Verificación final intensa.io ═══"

echo ""
echo "═══ ¿Sección precios fuera del HTML? ═══"
curl -sk https://intensa.io | grep -c "PRICING\|precios\|pricing-grid" && echo "✗ todavía está" || echo "✓ removida"

echo ""
echo "═══ ¿Link nav 'Precios' fuera? ═══"
curl -sk https://intensa.io | grep -c 'href="#precios"' && echo "✗ todavía link" || echo "✓ removido"

echo ""
echo "═══ ¿Toggle de idioma presente? ═══"
curl -sk https://intensa.io | grep -c 'lang-toggle\|lang-flag' | head -1

echo ""
echo "═══ ¿Translations en script.js? ═══"
curl -sk https://intensa.io/script.js | grep -c "translations\|applyTranslations"

echo ""
echo "═══ HTTP codes ═══"
echo "intensa.io       :"
curl -sk -o /dev/null -w "  HTTP  → %{http_code}\n" -H "Host: intensa.io" http://127.0.0.1/
curl -sk -o /dev/null -w "  HTTPS → %{http_code}\n" -H "Host: intensa.io" https://127.0.0.1/
echo "www.intensa.io   :"
curl -sk -o /dev/null -w "  HTTPS → %{http_code}\n" -H "Host: www.intensa.io" https://127.0.0.1/

echo ""
echo "═══ Veritas-trace.com no se rompió ═══"
curl -sk -o /dev/null -w "  HTTPS → %{http_code}\n" -H "Host: www.veritas-trace.com" https://127.0.0.1/
