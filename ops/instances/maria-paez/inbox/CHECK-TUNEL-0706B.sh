#!/bin/bash
echo "== 1080 =="
ss -tlnp | grep 1080 || echo "(nadie escucha en 1080)"
echo; echo "== ultima conexion aceptada =="
grep -i "accepted" /var/log/auth.log | tail -3
echo; echo "== estado WA en logs =="
grep -iE "WA túnel|WA ready|qr" /root/.pm2/logs/maria-paez-out.log | tail -5
