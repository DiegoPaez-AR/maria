#!/bin/bash
# Verificación post-deploy: corre daily-report.js en DRY_RUN para revisar
# los bloques nuevos (latencia Claude, cola de programados, anomalías)
# SIN mandar el mail. Output queda en outbox/verify-daily-report.out.
cd /root/secretaria || { echo "ERROR: no pude cd /root/secretaria"; exit 1; }
echo "host: $(hostname)  fecha: $(date -Is)"
echo "node: $(node --version)"
echo "==================== DRY_RUN daily-report.js ===================="
DRY_RUN=1 /usr/bin/node daily-report.js 2>&1
RC=$?
echo "==================== exit code: $RC ===================="
