#!/bin/bash
cd /root/secretaria
echo "── ticks del cron entre 07:00 y 08:10 de hoy ──"
timeout 20 awk '/═══ 2026-09-03T07:[0-5]/,/═══ 2026-09-03T08:1/' ops/.cron.log | grep -E "═══|push fase|FAIL|fail|rejected|canary|timeout|TIMEOUT|error" | head -50
echo ""
echo "── alerta del healthcheck (json) ──"
cat ops/instances/maria-paez/snapshots/HEALTHCHECK-ALERT.json 2>/dev/null | head -20
echo ""
echo "── ¿el healthcheck mató algún tick colgado? ──"
timeout 10 grep -h "cron-master colgado\|lo mato" /var/log/syslog /root/secretaria/ops/.healthcheck.log 2>/dev/null | tail -5
echo "── carga del VPS ahora ──"; uptime; free -m | head -2; df -h / | tail -1
echo LISTO
