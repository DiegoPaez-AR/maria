#!/bin/bash
cd /root/secretaria
echo "── historia canary reciente ──"
grep -E "canary (OK|FALLÓ|FALLO)" ops/.cron.log | tail -5
echo "── detalle del fallo ──"
grep -A3 "not ok" /tmp/canary-tick.log 2>/dev/null | head -25
echo LISTO
