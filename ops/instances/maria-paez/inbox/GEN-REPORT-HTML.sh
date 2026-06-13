#!/bin/bash
cd /root/secretaria
DUMP_HTML=/root/secretaria/ops/instances/maria-paez/outbox/daily-report-preview.html \
  DRY_RUN=1 /usr/bin/node daily-report.js > /dev/null 2>&1
echo "exit=$?"
ls -la /root/secretaria/ops/instances/maria-paez/outbox/daily-report-preview.html 2>&1
