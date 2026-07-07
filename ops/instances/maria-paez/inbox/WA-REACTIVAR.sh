#!/bin/bash
# Meta liberó la línea (2026-07-07) — chequear túnel y reactivar WA
ST=/root/secretaria/state/maria-paez
echo "== túnel =="
ss -tlnp | grep -q 1080 && echo "puerto 1080 escucha" || echo "PUERTO 1080 NO ESCUCHA"
IP=$(curl -s -m 10 --socks5 127.0.0.1:1080 https://api.ipify.org || echo FALLO)
echo "egreso socks5: $IP"
if [ "$IP" = "FALLO" ] || [ -z "$IP" ]; then
  echo "túnel CAÍDO — NO reactivo WA (conectar sin proxy = IP alemana = riesgo). Revivir túnel Mac primero."
  exit 0
fi
echo "== reactivando WA =="
rm -f "$ST/wa-apagado" "$ST/wa-retry-after"
rm -rf "$ST/.wwebjs_auth/session" 2>/dev/null
cd /root/secretaria && pm2 restart maria-paez --update-env >/dev/null 2>&1
sleep 15
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo "== últimas líneas =="
tail -12 /root/.pm2/logs/maria-pa*out*.log | grep -vE "^\s*$"
