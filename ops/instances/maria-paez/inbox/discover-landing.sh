#!/bin/bash
# Descubrir dónde vive intensa.io/L0001 y cómo se deploya.
set +e

echo "═══ NGINX vhost de intensa.io ═══"
for f in /etc/nginx/sites-enabled/intensa* /etc/nginx/sites-available/intensa* /etc/nginx/conf.d/intensa*; do
  [ -f "$f" ] && { echo "--- $f ---"; cat "$f"; echo; }
done

echo "═══ Localizar root de intensa.io ═══"
nginx -T 2>/dev/null | grep -A 2 "server_name.*intensa" | head -20

echo "═══ ls de los paths probables ═══"
for d in /var/www/intensa.io /var/www/intensa /root/intensa.io /root/intensa /srv/intensa.io; do
  [ -d "$d" ] && { echo "--- $d ---"; ls -la "$d" 2>&1 | head -10; }
done

echo "═══ Buscar L0001 ═══"
find /var/www /root /srv -maxdepth 5 -type d -iname "L0001" 2>/dev/null

echo "═══ Buscar deploy.sh ==="
find /var/www /root /srv -maxdepth 4 -name "deploy.sh" 2>/dev/null | head -10

echo "═══ DONE ═══"
