#!/bin/bash
BASE="https://intensa.io/hooks/wa-maria"
SECRET="cfS1IoCOSxNtVUwIzomSLsqccS5iL7Q8"
echo "── 1. POST de test (isTestMessage — sin efectos) a la URL PÚBLICA ──"
curl -s -m 15 -X POST "$BASE/$SECRET" -H 'Content-Type: application/json' \
  -d '{"query":{"sender":"000","message":"ping","isTestMessage":true}}' | head -c 300
echo ""
echo "── 2. GET pendiente.txt (cola; vacío = inofensivo) ──"
R=$(curl -s -m 15 "$BASE/$SECRET/pendiente.txt")
echo "respuesta: '${R:0:80}'"
echo "── 3. secret inválido debe dar 401 ──"
curl -s -m 15 -o /dev/null -w "con secret trucho: HTTP %{http_code}\n" "$BASE/xxxxxxxxxxxxxxxx/pendiente.txt"
echo "── 4. mapeo nginx del path /hooks/wa-maria ──"
grep -rn "wa-maria\|/hooks/" /etc/nginx/sites-enabled/ 2>/dev/null | head -5
echo LISTO
