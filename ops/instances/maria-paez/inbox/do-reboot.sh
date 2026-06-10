#!/bin/bash
# inbox: pm2 save + reboot del VPS (3 kernels pendientes desde hace 53 días).
# El reboot se lanza con delay para que este output llegue al outbox antes.
set -u
echo "== procesos pm2 actuales =="
pm2 jlist | python3 -c "
import json, sys
for p in json.load(sys.stdin):
    print('-', p.get('name'), p.get('pm2_env', {}).get('status'))
"
echo "== pm2 save =="
pm2 save
echo "== reboot en 30s (deja que el cron pushee este output) =="
nohup bash -c 'sleep 30; /sbin/reboot' >/dev/null 2>&1 &
disown
echo "reboot programado"
