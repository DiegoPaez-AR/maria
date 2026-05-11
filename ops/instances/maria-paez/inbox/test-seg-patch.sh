#!/bin/bash
set +e
cd /root/secretaria

echo "── 1. Confirmar que daily-report.js tiene el bloque seguridad ──"
grep -c "seguridad" /root/secretaria/daily-report.js
echo

echo "── 2. DRY_RUN: ver preview con bloque de seguridad ──"
DRY_RUN=1 /usr/bin/node /root/secretaria/daily-report.js 2>&1 | tail -45

echo
echo "── 3. Mandar reporte ACTUALIZADO de hoy (con seguridad) ──"
/usr/bin/node /root/secretaria/daily-report.js 2>&1 | tail -10

echo "fin"
