#!/bin/bash
CONF=/etc/ssh/sshd_config.d/99-maria-tunel-keepalive.conf
if [ ! -f "$CONF" ]; then
  printf "ClientAliveInterval 30\nClientAliveCountMax 3\n" > "$CONF"
fi
if sshd -t 2>&1; then
  systemctl reload ssh && echo "sshd keepalive OK + reload"
else
  rm -f "$CONF"; echo "sshd -t FALLÓ — revertido, NO recargué"
fi
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "pm2 reload OK"
sleep 45
grep -iE "WA túnel|WA ready" /root/.pm2/logs/maria-paez-out.log | tail -2
grep -n "errorKey: errKey" /root/secretaria/programados.js && echo "fix presente en VPS"
