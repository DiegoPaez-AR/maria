#!/bin/bash
echo "== puerto 1080 =="
ss -tlnp | grep 1080 || echo "NO ESCUCHA"
echo "== conexiones ssh del túnel (edad) =="
ps -o pid,etime,cmd -C sshd | grep -v grep | tail -5
IP=$(curl -s -m 10 --socks5 127.0.0.1:1080 https://api.ipify.org || echo FALLO)
echo "egreso socks5: $IP"
if [ "$IP" != "FALLO" ] && [ -n "$IP" ]; then
  echo "túnel responde → restart (Chromium colgado)"
  cd /root/secretaria && pm2 restart maria-paez --update-env >/dev/null 2>&1 && echo "restart OK"
else
  echo "túnel CAÍDO — revisar lado Mac"
fi
