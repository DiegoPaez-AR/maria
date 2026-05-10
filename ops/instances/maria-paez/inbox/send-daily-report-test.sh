#!/bin/bash
set +e
cd /root/secretaria

echo "── Mandando reporte HTML real a OWNER_EMAIL ──"
node daily-report.js 2>&1 | tail -30
