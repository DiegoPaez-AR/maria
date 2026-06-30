#!/bin/bash
set +e
cd /root/secretaria
DUMP_HTML=/tmp/funnel-preview.html DRY_RUN=1 node daily-report.js > /tmp/dr.out 2>&1
echo "### exit code: $? ###"
echo "### TEXT — sección funnel ###"
sed -n '/FUNNEL SUSCRIPCIÓN/,/Reporte automático generado/p' /tmp/dr.out
echo
echo "### HTML — bloque funnel (texto plano) ###"
sed -n '/Funnel suscripción/,/Clientes:/p' /tmp/funnel-preview.html | sed 's/<[^>]*>//g' | grep -vE '^\s*$' | head -30
echo
echo "### ultimas lineas del run (errores si hubo) ###"
tail -6 /tmp/dr.out
echo "=== DONE ==="
