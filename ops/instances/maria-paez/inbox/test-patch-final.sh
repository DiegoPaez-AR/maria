#!/bin/bash
set +e
cd /root/secretaria

# Espera 90s para asegurar que cualquier reload pendiente termine
sleep 30

echo "── pm2 status actual ──"
pm2 list 2>&1 | head -6

echo
echo "── DRY_RUN: preview reporte v3 ──"
DRY_RUN=1 /usr/bin/node /root/secretaria/daily-report.js 2>&1 | tail -45

echo
echo "── Mandar reporte v3 a diego@paez.is ──"
/usr/bin/node /root/secretaria/daily-report.js 2>&1 | tail -5

echo "fin"
