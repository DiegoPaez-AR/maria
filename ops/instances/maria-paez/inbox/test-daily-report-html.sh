#!/bin/bash
set +e
cd /root/secretaria
echo "── DRY_RUN del reporte (preview texto + length HTML) ──"
DRY_RUN=1 node daily-report.js 2>&1 | head -100
