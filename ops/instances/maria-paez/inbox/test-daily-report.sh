#!/bin/bash
set +e
cd /root/secretaria

echo "── 1. SMOKE TEST: correr daily-report.js DRY_RUN=1 ──"
DRY_RUN=1 node daily-report.js 2>&1 | head -120
echo
echo "── 2. Si el smoke test fue OK, instalar cron diario 06:00 ART ──"
echo "(no instalo ahora — espero confirmación de Diego)"
