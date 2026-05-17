#!/bin/bash
# Despliega el sitio intensa.io: sincroniza /var/www/intensa.io con
# ops/sites/intensa.io/{index.html,styles.css,script.js} y refresca el
# vhost de nginx si no existe.
#
# Idempotente — corré tantas veces como quieras tras editar el sitio.
# NO toca el vhost veritas-trace ni reinicia nginx (solo reload, atomic).

set -e

SRC="/root/secretaria/ops/sites/intensa.io"
DEST="/var/www/intensa.io"
VHOST_SRC="$SRC/vhost.conf"
VHOST_DEST="/etc/nginx/sites-available/intensa.io.conf"
VHOST_LINK="/etc/nginx/sites-enabled/intensa.io.conf"

echo "═══ 1. Crear/actualizar docroot ═══"
mkdir -p "$DEST"
cp -v "$SRC/index.html" "$SRC/styles.css" "$SRC/script.js" "$DEST/"
chown -R www-data:www-data "$DEST"
chmod -R 644 "$DEST"/*
find "$DEST" -type d -exec chmod 755 {} +

echo ""
echo "═══ 2. Vhost nginx ═══"
if [ ! -f "$VHOST_DEST" ] || ! cmp -s "$VHOST_SRC" "$VHOST_DEST"; then
    cp -v "$VHOST_SRC" "$VHOST_DEST"
    echo "vhost actualizado"
else
    echo "vhost sin cambios"
fi

if [ ! -L "$VHOST_LINK" ]; then
    ln -sv "$VHOST_DEST" "$VHOST_LINK"
    echo "symlink creado"
else
    echo "symlink ya existe"
fi

echo ""
echo "═══ 3. Validar config nginx ═══"
nginx -t

echo ""
echo "═══ 4. Reload nginx (atomic, no cae el otro sitio) ═══"
systemctl reload nginx
systemctl is-active nginx

echo ""
echo "═══ 5. Smoke test local ═══"
curl -s -H "Host: intensa.io" -o /dev/null -w "intensa.io        HTTP %{http_code}\n" http://127.0.0.1/
curl -s -H "Host: www.intensa.io" -o /dev/null -w "www.intensa.io    HTTP %{http_code}\n" http://127.0.0.1/
curl -s -H "Host: www.veritas-trace.com" -o /dev/null -w "veritas-trace.com (no se rompió) HTTPS %{http_code}\n" https://127.0.0.1/ -k

echo ""
echo "═══ DONE — listo para certbot cuando el DNS apunte ═══"
echo "Cuando intensa.io resuelva a 178.104.166.91, corré:"
echo "  certbot --nginx -d intensa.io -d www.intensa.io --redirect"
