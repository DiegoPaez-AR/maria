#!/bin/bash
set -a; cf=/root/secretaria/config/instances/maria-paez.conf; . "$cf"; set +a
echo "== HEALTHCHECK-ALERT.json =="
cat /root/secretaria/ops/instances/maria-paez/snapshots/HEALTHCHECK-ALERT.json 2>&1 | head -40
echo ""
echo "== últimos errores google/oauth/invalid_grant en pm2 (60 líneas relevantes) =="
pm2 logs maria-paez --lines 3000 --nostream 2>/dev/null | grep -iE "oauth|invalid_grant|token|google.*(error|fail|denied)|refresh" | tail -25
echo ""
echo "== ¿anda ahora? probe rápido de gmail/calendar (si hay healthcheck script) =="
ls -la /root/secretaria/ops/*health* /root/secretaria/*health* 2>/dev/null
