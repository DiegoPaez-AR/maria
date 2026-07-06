#!/bin/bash
cd /root/secretaria && DRY_RUN=1 node daily-report.js 2>&1 | grep -A2 -B2 -i "gasto\|error" | head -40
