#!/bin/bash
set +e
cd /root/secretaria

echo "── Verificar que el patch nuevo está en el repo ──"
grep -c "deploys" /root/secretaria/daily-report.js
grep -c "is_owner" /root/secretaria/daily-report.js
echo

echo "── DRY_RUN: preview del reporte con patch v2 ──"
DRY_RUN=1 /usr/bin/node /root/secretaria/daily-report.js 2>&1 | tail -60

echo
echo "── Mandar reporte ACTUALIZADO (con deploys/crashes + contexto seguridad) ──"
/usr/bin/node /root/secretaria/daily-report.js 2>&1 | tail -10

echo "fin"
