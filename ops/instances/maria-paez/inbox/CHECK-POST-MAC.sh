#!/bin/bash
ST=/root/secretaria/state/maria-paez
echo "wa-apagado: $(ls $ST/wa-apagado 2>/dev/null || echo 'NO ESTÁ')"
echo "chromium corriendo: $(pgrep -fc 'chrome.*maria|chromium' || echo 0)"
echo "puerto 1080: $(ss -tln | grep -c 1080)"
echo "== [WA APAGADO] en log de hoy =="
grep -a "WA APAGADO" /root/.pm2/logs/maria-pa*.log 2>/dev/null | tail -2
echo "== TG getMe =="
cd /root/secretaria && set -a && . config/instances/maria-paez.conf 2>/dev/null; . config/secrets.conf 2>/dev/null; set +a
curl -s -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" | head -c 200
