#!/bin/bash
set +e

echo "═══ DNS check (manejando CNAME) ═══"
for h in intensa.io www.intensa.io; do
  # +short devuelve CNAMEs y A records; nos quedamos solo con IPs.
  IP=$(dig +short $h @1.1.1.1 | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
  if [ "$IP" != "178.104.166.91" ]; then
    echo "✗ $h → $IP (esperaba 178.104.166.91) — abortando"
    exit 1
  fi
  echo "✓ $h → $IP"
done

echo ""
echo "═══ certbot --nginx ═══"
certbot --nginx \
  -d intensa.io -d www.intensa.io \
  --redirect --non-interactive --agree-tos \
  -m diego@paez.is --no-eff-email 2>&1

echo ""
echo "═══ Cert listo ═══"
certbot certificates 2>&1 | grep -E "Certificate Name|Domains|Expiry" | head -20

echo ""
echo "═══ Smoke tests ═══"
curl -s -o /dev/null -w "intensa.io          HTTP(:80) %{http_code} (esperado 301)\n" -H "Host: intensa.io" http://127.0.0.1/
curl -sk -o /dev/null -w "intensa.io          HTTPS    %{http_code} (esperado 200)\n" -H "Host: intensa.io" https://127.0.0.1/
curl -sk -o /dev/null -w "www.intensa.io      HTTPS    %{http_code} (esperado 200)\n" -H "Host: www.intensa.io" https://127.0.0.1/
curl -sk -o /dev/null -w "veritas-trace.com   HTTPS    %{http_code} (esperado 200)\n" -H "Host: www.veritas-trace.com" https://127.0.0.1/
