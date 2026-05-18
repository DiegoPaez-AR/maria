#!/bin/bash
# Despliega el sitio intensa.io: sincroniza /var/www/intensa.io con
# ops/sites/intensa.io/{index.html,styles.css,script.js}.
#
# Idempotente — corré tantas veces como quieras tras editar el sitio.
# NO toca el vhost veritas-trace.
#
# IMPORTANTE — vhost nginx:
# El archivo vhost.conf del repo es el TEMPLATE inicial (HTTP only).
# Tras correr `certbot --nginx`, el vhost real en
# /etc/nginx/sites-available/intensa.io.conf queda con bloques SSL
# adicionales. Para NO perder esos bloques en deploys futuros,
# este script SOLO instala el vhost del repo si NO existe el del nginx
# todavía. Si ya existe (con SSL configurado o no), lo respeta.

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
if [ ! -f "$VHOST_DEST" ]; then
    echo "Vhost no existe — copiando del repo (versión inicial HTTP-only)..."
    cp -v "$VHOST_SRC" "$VHOST_DEST"
    echo "→ Después de este deploy, correr: certbot --nginx -d intensa.io -d www.intensa.io --redirect"
elif grep -q "ssl_certificate" "$VHOST_DEST"; then
    echo "Vhost existente tiene SSL configurado (post-certbot) — NO TOCANDO el archivo."
    echo "Si querés actualizar la config del vhost a mano, editá $VHOST_DEST directamente."
else
    echo "Vhost existe pero sin SSL — sincronizando con el repo (mismo formato HTTP-only)..."
    cp -v "$VHOST_SRC" "$VHOST_DEST"
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
echo "═══ 4. Reload nginx (atomic) ═══"
systemctl reload nginx
systemctl is-active nginx

echo ""
echo "═══ 5. Smoke test local ═══"
curl -s -H "Host: intensa.io" -o /dev/null -w "intensa.io        HTTP %{http_code}\n" http://127.0.0.1/
curl -s -H "Host: www.intensa.io" -o /dev/null -w "www.intensa.io    HTTP %{http_code}\n" http://127.0.0.1/
if grep -q "ssl_certificate" "$VHOST_DEST" 2>/dev/null; then
    curl -sk -H "Host: intensa.io" -o /dev/null -w "intensa.io        HTTPS %{http_code}\n" https://127.0.0.1/
    curl -sk -H "Host: www.intensa.io" -o /dev/null -w "www.intensa.io    HTTPS %{http_code}\n" https://127.0.0.1/
fi
curl -sk -H "Host: www.veritas-trace.com" -o /dev/null -w "veritas-trace (no se rompió) HTTPS %{http_code}\n" https://127.0.0.1/ -k

echo ""
echo "═══ DONE ═══"
