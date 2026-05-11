#!/bin/bash
set +e
cd /root/secretaria

echo "════════════════════════════════════════════"
echo "1) crontab actual de root"
echo "════════════════════════════════════════════"
crontab -l 2>&1 | sed -n '1,40p'

echo
echo "════════════════════════════════════════════"
echo "2) ¿Hay entrada para daily-report?"
echo "════════════════════════════════════════════"
crontab -l 2>&1 | grep -i 'daily-report\|daily_report\|reporte' || echo "  → NO hay cron entry para daily-report"

echo
echo "════════════════════════════════════════════"
echo "3) Último .cron.log (cron-master) — últimas 80 líneas"
echo "════════════════════════════════════════════"
tail -80 /root/secretaria/ops/.cron.log 2>&1

echo
echo "════════════════════════════════════════════"
echo "4) ¿Existe log dedicado de daily-report?"
echo "════════════════════════════════════════════"
ls -la /root/secretaria/ops/*daily* /root/secretaria/ops/.daily* /var/log/maria-daily* 2>&1 | head -20

echo
echo "════════════════════════════════════════════"
echo "5) SMOKE: correr daily-report.js en DRY_RUN ahora (sólo render, no manda)"
echo "════════════════════════════════════════════"
DRY_RUN=1 node /root/secretaria/daily-report.js 2>&1 | tail -50

echo
echo "════════════════════════════════════════════"
echo "6) Estado pm2 + memoria"
echo "════════════════════════════════════════════"
pm2 list 2>&1 | head -20
free -m | head -3
df -h / | tail -1

echo
echo "════════════════════════════════════════════"
echo "7) Eventos de seguridad de las últimas 24h"
echo "════════════════════════════════════════════"
DB=/root/secretaria/db/maria.sqlite
HACE24="datetime('now','-24 hours')"

echo "-- Tabla audit_log (si existe):"
sqlite3 -header -column "$DB" ".schema audit_log" 2>&1 | head -10
sqlite3 -header -column "$DB" "SELECT COUNT(*) AS total_audit_24h FROM audit_log WHERE timestamp >= $HACE24;" 2>&1
echo
echo "-- Últimos 20 eventos de auditoría:"
sqlite3 -header -column "$DB" \
  "SELECT id, timestamp, usuario_id, accion, COALESCE(detalle,'') AS detalle
   FROM audit_log
   WHERE timestamp >= $HACE24
   ORDER BY id DESC LIMIT 20;" 2>&1 | head -40

echo
echo "-- Alertas/violaciones de seguridad en logs pm2 (24h):"
pm2 logs maria-paez --lines 5000 --nostream 2>/dev/null | grep -iE 'security|alert|violation|denegad|bloqued|rate.?limit|sandbox|bwrap.*fail|destinatario.*no\|destinatario.*denegad' | tail -30

echo
echo "-- Rate-limit hits (24h):"
pm2 logs maria-paez --lines 5000 --nostream 2>/dev/null | grep -iE 'rate.?limit|throttle|too many' | tail -10

echo
echo "════════════════════════════════════════════"
echo "8) OAuth: ¿algún invalid_grant últimas 24h?"
echo "════════════════════════════════════════════"
pm2 logs maria-paez --lines 5000 --nostream 2>/dev/null | grep -iE 'invalid_grant|oauth|token expir' | tail -10 || echo "  → ninguno"

echo
echo "fin"
