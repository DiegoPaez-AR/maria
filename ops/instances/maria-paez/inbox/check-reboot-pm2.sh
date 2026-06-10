#!/bin/bash
# inbox: diagnostico reboot pendiente + resiliencia de pm2 ante reboot.
set -u
echo "── reboot requerido?"
if [ -f /var/run/reboot-required ]; then
  cat /var/run/reboot-required
  cat /var/run/reboot-required.pkgs 2>/dev/null
else
  echo "no hay /var/run/reboot-required"
fi
echo "── uptime y kernel"
uptime
uname -r
echo "── pm2 startup configurado?"
systemctl is-enabled pm2-root 2>&1 || echo "pm2-root systemd unit NO habilitada"
systemctl is-active pm2-root 2>&1 || true
echo "── dump de pm2 (resurrect list)"
if [ -f /root/.pm2/dump.pm2 ]; then
  python3 -c "
import json
d = json.load(open('/root/.pm2/dump.pm2'))
print('procesos en dump:', [p.get('name') for p in d])
" 2>&1
  echo "dump mtime: $(stat -c %y /root/.pm2/dump.pm2)"
else
  echo "NO existe /root/.pm2/dump.pm2 — pm2 save nunca corrido"
fi
echo "── crontab actual (lineas maria)"
crontab -l | grep -E 'cron-master|backup|healthcheck'
