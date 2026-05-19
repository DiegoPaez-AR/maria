#!/bin/bash
# Diagnóstico — por qué L0001 no redirige.
set +e
VHOST=/etc/nginx/sites-available/intensa.io.conf

echo "═══ Líneas relevantes del vhost ═══"
grep -nE "location|L0001|server_name" "$VHOST" | head -20

echo
echo "═══ Test curl detallado contra localhost ═══"
curl -sk -v -o /dev/null --resolve intensa.io:443:127.0.0.1 https://intensa.io/L0001/ 2>&1 | grep -E "HTTP/|Location|< X|Host:" | head -10

echo
echo "═══ pgrep nginx + uptime workers (verifica que el reload corrió) ═══"
pgrep -a nginx | head -5

echo
echo "═══ Forzar reload (extra reload por las dudas) ═══"
nginx -t 2>&1 | tail -3
systemctl reload nginx
sleep 1
systemctl is-active nginx

echo
echo "═══ Retry curl ==="
curl -sk -o /dev/null -w "HTTP %{http_code}  Location: %{redirect_url}\n" -I https://intensa.io/L0001/
