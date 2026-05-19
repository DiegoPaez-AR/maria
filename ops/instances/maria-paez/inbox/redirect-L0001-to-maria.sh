#!/bin/bash
# Agregar location /L0001/ con redirect 301 → /maria/ en el vhost de intensa.io.
# Idempotente: no agrega si ya está presente.

set +e
VHOST=/etc/nginx/sites-available/intensa.io.conf

echo "═══ Verificar si el redirect ya existe ═══"
if grep -q "location /L0001" "$VHOST"; then
  echo "  redirect ya presente. Skip."
  exit 0
fi

echo
echo "═══ Backup del vhost ═══"
cp -v "$VHOST" "${VHOST}.bak-$(date +%Y%m%d-%H%M%S)"

echo
echo "═══ Inyectar location /L0001/ con 301 ═══"
# Inyectar después del 'location /' (line "    location / {" + 3 líneas del bloque)
# Estrategia más simple y portable: usar python para parse el server { listen 443 } y agregar el location ahí.
python3 <<'PYEOF'
path = "/etc/nginx/sites-available/intensa.io.conf"
with open(path) as f: src = f.read()

# Inyectar el location justo antes del primer "location / {"
inject = '''    location = /L0001/ { return 301 /maria/; }
    location = /L0001 { return 301 /maria/; }

'''
marker = "    location / {"
if marker not in src:
    print("MARKER no encontrado, no toco nada")
    exit(1)
i = src.index(marker)
src = src[:i] + inject + src[i:]
with open(path, "w") as f: f.write(src)
print("vhost actualizado")
PYEOF

echo
echo "═══ Validar nginx config ═══"
nginx -t

echo
echo "═══ Reload nginx ═══"
systemctl reload nginx
systemctl is-active nginx

echo
echo "═══ Smoke test: /L0001/ debería redirigir a /maria/ ═══"
curl -sk -o /dev/null -w "L0001/ → HTTP %{http_code}  Location: %{redirect_url}\n" -I "https://intensa.io/L0001/"
echo "Siguiendo redirect:"
curl -sk -L -o /dev/null -w "tras redirect → HTTP %{http_code}  URL final: %{url_effective}\n" "https://intensa.io/L0001/"

echo
echo "═══ Smoke test: /maria/ sigue sirviendo ═══"
curl -sk -o /dev/null -w "/maria/ → HTTP %{http_code}\n" "https://intensa.io/maria/"

echo
echo "═══ DONE ═══"
