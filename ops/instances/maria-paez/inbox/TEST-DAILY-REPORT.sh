#!/bin/bash
# Smoke test del daily-report con las secciones nuevas (no manda mail)
cd /root/secretaria && DRY_RUN=1 /usr/bin/node daily-report.js 2>&1 | head -120
