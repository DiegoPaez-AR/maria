#!/bin/bash
cd /root/secretaria
DRY_RUN=1 node daily-report.js 2>&1 | grep -A3 -B1 "Telegram" | head -15
echo LISTO
