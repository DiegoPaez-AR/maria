#!/bin/bash
cd /root/secretaria
echo "── hora del VPS ──"; date; date -u
echo "── cron del daily-report ──"; crontab -l | grep -i daily
echo "── envios del reporte (ultimos) ──"
grep -iE "daily-report|enviado a diego" /root/secretaria/ops/.cron.log 2>/dev/null | tail -5
grep -riE "daily" /root/.daily-report.log 2>/dev/null | tail -5
ls -l --time-style=+%Y-%m-%d\ %H:%M /root/.daily-report.log 2>/dev/null
echo LISTO
