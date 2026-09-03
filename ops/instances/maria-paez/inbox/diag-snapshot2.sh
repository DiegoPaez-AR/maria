#!/bin/bash
cd /root/secretaria
echo "── ticks 07:24 → 08:05 (sin los OK rutinarios) ──"
timeout 20 awk '/═══ 2026-09-03T07:2[4-9]/,/═══ 2026-09-03T08:0[5-9]/' ops/.cron.log | grep -vE "^push fase 1 OK$|^tick done$" | head -40
echo ""
echo "── alerta completa ──"
cat ops/instances/maria-paez/snapshots/HEALTHCHECK-ALERT.json 2>/dev/null | grep -A 3 "snapshot_recent"
echo "── el check snapshot_recent: qué mide ──"
grep -n "snapshot_recent" -A 8 ops/healthcheck.sh | head -14
echo "── snapshots: última escritura ──"
ls -lt --time-style=+%H:%M ops/instances/maria-paez/snapshots/ | head -4
echo LISTO
