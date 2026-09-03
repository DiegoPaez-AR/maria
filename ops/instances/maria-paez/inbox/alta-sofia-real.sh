#!/bin/bash
cd /root/secretaria
echo "═══ ALTA REAL sofia-bruscoli ═══"
timeout 180 bash ops/provision/nueva-instancia.sh sofia-bruscoli "Sofia Bruscoli" sofia@luminaconsultora.com 2>&1 | grep -vE "^ [1-8]\.|^      |^    →|^═══ CHECKLIST|^═══════" | head -30
echo ""
echo "── secret real + link de config del bridge ──"
SEC=$(grep -E '^WA_HOOK_SECRET=' config/instances/sofia-bruscoli.conf | cut -d= -f2)
echo "  WA_HOOK_SECRET=$SEC"
echo "  mariabridge://config?url=https%3A%2F%2Fintensa.io%2Fhooks%2Fwa-sofia-bruscoli&secret=$SEC"
echo "  URL manual: https://intensa.io/hooks/wa-sofia-bruscoli   secret: $SEC"
echo ""
echo "── URL de OAuth para sofia@luminaconsultora.com ──"
( set -a; . config/instances/sofia-bruscoli.conf; [ -f config/secrets.conf ] && . config/secrets.conf; set +a
  timeout 60 node auth-gmail.js url 2>&1 | tail -3 )
echo ""
echo "── nginx ──"; nginx -t 2>&1 | tail -1
echo "── puerto libre? ──"; (ss -ltnp 2>/dev/null | grep -q ":4502 " && echo "  4502 OCUPADO") || echo "  4502 libre (correcto, la instancia no arrancó aún)"
echo LISTO
