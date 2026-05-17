#!/bin/bash
# Reconocer estado actual del web server en el VPS antes de tocar.
# Objetivo: subir intensa.io sin romper el sitio existente.
set +e

echo "═══ Web server corriendo ═══"
systemctl is-active apache2 nginx 2>&1
ss -tlnp 2>/dev/null | grep -E ':80\b|:443\b' | head -10
echo ""

echo "═══ Versiones ═══"
apache2 -v 2>&1 | head -2
apachectl -V 2>&1 | grep -E "Server (root|MPM)" | head -5
certbot --version 2>&1 | head -1
echo ""

echo "═══ Vhosts Apache habilitados ═══"
ls -la /etc/apache2/sites-enabled/ 2>&1
echo ""

echo "═══ Cada vhost completo ═══"
for f in /etc/apache2/sites-enabled/*.conf; do
  [ -f "$f" ] || continue
  echo "─── $f ───"
  cat "$f"
  echo ""
done

echo "═══ DocRoots y contenido (apache mostrar todos) ═══"
apachectl -S 2>&1 | head -40
echo ""

echo "═══ DNS de intensa.io desde el VPS ═══"
dig +short intensa.io
dig +short www.intensa.io
echo ""

echo "═══ IP pública del VPS ═══"
curl -s https://api.ipify.org 2>&1
echo ""

echo "═══ Certificados Let's Encrypt instalados ═══"
ls /etc/letsencrypt/live/ 2>/dev/null
certbot certificates 2>&1 | grep -E "Certificate Name|Domains|Expiry" | head -30

echo ""
echo "═══ Hosts file ═══"
grep -v '^#' /etc/hosts | grep -v '^$' | head -10

echo ""
echo "═══ DONE ═══"
