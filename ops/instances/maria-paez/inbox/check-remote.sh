#!/bin/bash
cd /root/secretaria
echo "── remote con token? (enmascarado) ──"
git remote get-url origin | sed -E "s#(https://)[^@]+@#\\1***@#"
echo "── rate limit actual de GitHub para esta IP/token ──"
TOK=$(git remote get-url origin | sed -nE "s#https://([^@]+)@.*#\\1#p" | cut -d: -f2)
curl -s -m 10 -H "Authorization: token $TOK" https://api.github.com/rate_limit | python3 -c "import json,sys; d=json.load(sys.stdin); c=d[\"rate\"]; print(\"  limit\", c[\"limit\"], \"remaining\", c[\"remaining\"])" 2>/dev/null || echo "  (sin respuesta)"
echo LISTO
