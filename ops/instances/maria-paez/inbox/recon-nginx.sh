#!/bin/bash
set +e
echo "═══ nginx -v ═══"
nginx -v 2>&1

echo ""
echo "═══ Server blocks habilitados ═══"
ls -la /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>&1

echo ""
echo "═══ Server blocks (config completa) ═══"
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] || continue
  echo "─── $f ───"
  cat "$f"
  echo ""
done

echo "═══ nginx -T (config completa expandida) ═══"
nginx -T 2>&1 | head -200

echo ""
echo "═══ DocRoots existentes en /var/www/ ═══"
ls -la /var/www/ 2>&1

echo ""
echo "═══ Verificación: cosas que escuchan en puertos web ═══"
ss -tlnp 2>/dev/null | grep -E ':80\b|:443\b'

echo ""
echo "═══ DONE ═══"
