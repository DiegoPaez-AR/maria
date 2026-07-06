#!/bin/bash
cd /root/secretaria
echo "── 1. túnel argentino ──"
IP=$(curl -s -m 12 --socks5-hostname 127.0.0.1:1080 https://ifconfig.me 2>/dev/null)
if [ -z "$IP" ]; then echo "🔴 TÚNEL CAÍDO — ABORTO (no reconectamos por Alemania)"; exit 1; fi
echo "túnel OK: $IP"
echo "── 2. sacar markers ──"
rm -f state/maria-paez/wa-apagado state/maria-paez/tg-wa-down state/maria-paez/wa-retry-after
echo "markers fuera"
echo "── 3. reload con env nuevo (WA_PROXY entra acá) ──"
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
echo "reload exit=$?"
sleep 8
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    if p['name']=='maria-paez':
        e=p['pm2_env']; env={**e, **(e.get('env') or {})}
        print('WA_PROXY en env vivo:', env.get('WA_PROXY') or 'AUSENTE')
"
echo "── 4. esperar conexión (45s) ──"
sleep 45
grep -E "WA túnel|WA ready|WA qr|WA authenticated|MODO DEGRADADO" ~/.pm2/logs/maria-paez-out.log | tail -6
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo LISTO
