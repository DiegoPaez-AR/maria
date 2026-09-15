#!/bin/bash
cd /root/secretaria
set -a; . config/instances/maria-paez.conf; . config/secrets.conf 2>/dev/null; set +a
echo "── estado de los comandos anteriores ──"
timeout 30 bash ops/tools/mb-remoto.sh estado 2>&1 | tail -6 | cut -c1-500
echo "── ¿el teléfono pollea la cola? últimas líneas MB / poll ──"
grep -hE "\[MB|MB-CTL|/outbox" logs/maria-paez/out.log | tail -5 | cut -c1-160
grep -h "wa-maria" /var/log/nginx/access.log 2>/dev/null | grep -v "hooks/wa-maria/.*/mbdiag" | tail -3 | cut -c1-140
echo "── nodos de nuevo (hasta 180s) ──"
timeout 200 bash ops/tools/mb-remoto.sh nodos 2>&1 | tail -20 | cut -c1-700
echo LISTO
