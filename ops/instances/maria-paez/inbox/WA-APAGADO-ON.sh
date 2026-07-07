#!/bin/bash
# Cuenta WA bloqueada por Meta (2026-07-07) — apagar WA (cero señales a Meta)
set -e
ST=/root/secretaria/state/maria-paez
touch "$ST/wa-apagado"
rm -f "$ST/wa-retry-after"
cd /root/secretaria && pm2 restart maria-paez --update-env >/dev/null 2>&1
sleep 6
echo "marker: $(ls -la $ST/wa-apagado)"
echo "tg-wa-down: $(cat $ST/tg-wa-down 2>/dev/null || echo 'no existe')"
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
tail -5 /root/.pm2/logs/maria-pa*out*.log 2>/dev/null | tail -5
