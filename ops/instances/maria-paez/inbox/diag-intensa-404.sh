#!/bin/bash
set +e
echo "═══ Archivos en docroot ═══"
ls -la /var/www/intensa.io/

echo ""
echo "═══ Permisos del dir padre ═══"
namei -l /var/www/intensa.io/index.html

echo ""
echo "═══ Test acceso como www-data ═══"
sudo -u www-data cat /var/www/intensa.io/index.html | head -2 2>&1

echo ""
echo "═══ nginx error.log últimas 30 ═══"
tail -30 /var/log/nginx/error.log
echo "─── intensa.io.error.log si existe ───"
tail -30 /var/log/nginx/intensa.io.error.log 2>&1

echo ""
echo "═══ nginx -T para intensa.io ═══"
nginx -T 2>/dev/null | grep -A 30 "server_name intensa.io"

echo ""
echo "═══ Curl con debug ═══"
curl -v -H "Host: intensa.io" http://127.0.0.1/ 2>&1 | head -30
