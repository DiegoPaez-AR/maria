#!/bin/bash
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf

echo "=== crontab del root (lineas daily-report) ==="
crontab -l 2>/dev/null | grep -iE "daily|report|secretaria" || echo "(no hay crontab o sin match)"

echo ""
echo "=== .conf: OWNER_EMAIL / ASISTENTE_FROM_EMAIL / VAULT (presencia) ==="
grep -nE "OWNER_EMAIL|ASISTENTE_FROM_EMAIL|MARIA_VAULT_KEY|OWNER_NOMBRE|DIEGO_EMAIL" "$cf" | sed -E 's/(VAULT_KEY=).*/\1<oculto>/' 

echo ""
echo "=== log del cron daily-report si existe ==="
for f in /root/secretaria/ops/.daily-report.log /root/secretaria/.daily-report.log /var/log/maria-daily-report.log; do
  [ -f "$f" ] && { echo "-- $f (tail) --"; tail -20 "$f"; }
done

echo ""
echo "=== CORRER daily-report.js (real, manda si puede) — captura error ==="
/usr/bin/node daily-report.js 2>&1 | tail -40
