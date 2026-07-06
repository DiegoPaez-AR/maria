#!/bin/bash
cd /root/secretaria
echo "── estado actual ──"
ls state/maria-paez/wa-retry-after 2>/dev/null && echo "EN REPOSO (marker presente) — lo saco" || echo "sin reposo"
rm -f state/maria-paez/wa-retry-after state/maria-paez/tg-wa-down
IP=$(curl -s -m 12 --socks5-hostname 127.0.0.1:1080 https://ifconfig.me 2>/dev/null)
[ -z "$IP" ] && { echo "🔴 túnel caído — ABORTO"; exit 1; }
echo "túnel OK: $IP — reinicio para ventana de QR fresca (10 min)"
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 25
grep -E "WA qr|WA túnel|WA ready" ~/.pm2/logs/maria-paez-out.log | tail -3
echo LISTO
