#!/bin/bash
set +e
echo "═══ Estado actual del vhost intensa.io ═══"
ls -la /etc/nginx/sites-enabled/intensa.io.conf
echo "¿Tiene SSL?"
grep -c "ssl_certificate" /etc/nginx/sites-available/intensa.io.conf

echo ""
echo "═══ Re-correr certbot para re-aplicar SSL ═══"
certbot --nginx \
  -d intensa.io -d www.intensa.io \
  --redirect --non-interactive --agree-tos \
  -m diego@paez.is --no-eff-email \
  --reinstall 2>&1 | tail -20

echo ""
echo "═══ ¿vhost ahora tiene SSL? ═══"
grep -c "ssl_certificate" /etc/nginx/sites-available/intensa.io.conf
grep -c "ssl_certificate" /etc/nginx/sites-enabled/intensa.io.conf

echo ""
echo "═══ Smoke tests ═══"
curl -s -H "Host: intensa.io" -o /dev/null -w "HTTP intensa.io     %{http_code}\n" http://127.0.0.1/
curl -sk -H "Host: intensa.io" -o /dev/null -w "HTTPS intensa.io    %{http_code}\n" https://127.0.0.1/
curl -sk -H "Host: www.intensa.io" -o /dev/null -w "HTTPS www.intensa  %{http_code}\n" https://127.0.0.1/
curl -sk -H "Host: www.veritas-trace.com" -o /dev/null -w "HTTPS veritas      %{http_code}\n" https://127.0.0.1/

echo ""
echo "═══ Verificar cert servido ═══"
echo "intensa.io →"
echo "" | openssl s_client -connect 127.0.0.1:443 -servername intensa.io 2>/dev/null | openssl x509 -noout -subject 2>/dev/null
echo "veritas-trace.com →"
echo "" | openssl s_client -connect 127.0.0.1:443 -servername www.veritas-trace.com 2>/dev/null | openssl x509 -noout -subject 2>/dev/null
