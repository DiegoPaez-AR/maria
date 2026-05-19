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
cp -v "$SRC/styles.css" "$SRC/script.js" "$DEST/"
# Cache-bust: inyectar timestamp en las refs a styles.css/script.js del index.html
# para forzar al browser a recargar tras cada deploy.
STAMP=$(date +%Y%m%d-%H%M%S)
sed "s|styles\.css|styles.css?v=${STAMP}|g; s|script\.js|script.js?v=${STAMP}|g" "$SRC/index.html" > "$DEST/index.html"
echo "  index.html con cache-bust v=${STAMP}"
chown -R www-data:www-data "$DEST"
chmod -R 644 "$DEST"/*
find "$DEST" -type d -exec chmod 755 {} +

echo ""
echo "═══ 1b. Sincronizar landings (subdirs de SRC/) ═══"
# Cada landing vive en un subdir de SRC/ (ej. maria/, L0042/). Sincronizamos cada
# uno y aplicamos cache-bust a sus refs a styles.css/script.js (mismo STAMP que el
# sitio raíz). Ignoramos archivos top-level (index.html, vhost.conf, etc.).
shopt -s nullglob
for landing_src in "$SRC"/*/; do
    landing_name=$(basename "$landing_src")
    landing_dest="$DEST/$landing_name"
    echo "  → $landing_name"
    mkdir -p "$landing_dest"
    cp -v "$landing_src/styles.css" "$landing_src/script.js" "$landing_dest/" 2>/dev/null || true
    if [ -f "$landing_src/index.html" ]; then
        sed "s|styles\.css|styles.css?v=${STAMP}|g; s|script\.js|script.js?v=${STAMP}|g" "$landing_src/index.html" > "$landing_dest/index.html"
        echo "    index.html con cache-bust v=${STAMP}"
    fi
    # Otros archivos y subdirectorios del landing (signup/, cuenta/, terminos/,
    # imágenes, etc.) se sincronizan con rsync para preservar la jerarquía.
    # Excluimos los 3 archivos top-level que ya manejamos arriba con cache-bust.
    rsync -a --exclude=/index.html --exclude=/styles.css --exclude=/script.js \
        "$landing_src" "$landing_dest/" 2>/dev/null || true
    # Para CADA subdir adentro del landing (ej. signup/, cuenta/, terminos/),
    # aplicamos cache-bust también a sus index.html.
    for sub in "$landing_dest"/*/; do
        [ -d "$sub" ] || continue
        if [ -f "$sub/index.html" ]; then
            sed -i "s|styles\.css|styles.css?v=${STAMP}|g; s|script\.js|script.js?v=${STAMP}|g" "$sub/index.html"
            echo "    cache-bust v=${STAMP} en $(basename "$sub")/index.html"
        fi
    done
    chown -R www-data:www-data "$landing_dest"
    find "$landing_dest" -type f -exec chmod 644 {} +
    find "$landing_dest" -type d -exec chmod 755 {} +
done
shopt -u nullglob

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

# Smoke test de landings (si existen)
shopt -s nullglob
for landing_dest in "$DEST"/L*/; do
    landing_name=$(basename "$landing_dest")
    if grep -q "ssl_certificate" "$VHOST_DEST" 2>/dev/null; then
        curl -sk -H "Host: intensa.io" -o /dev/null -w "intensa.io/${landing_name}/ HTTPS %{http_code}\n" "https://127.0.0.1/${landing_name}/"
    else
        curl -s -H "Host: intensa.io" -o /dev/null -w "intensa.io/${landing_name}/ HTTP %{http_code}\n" "http://127.0.0.1/${landing_name}/"
    fi
done
shopt -u nullglob

echo ""
echo "═══ DONE ═══"
