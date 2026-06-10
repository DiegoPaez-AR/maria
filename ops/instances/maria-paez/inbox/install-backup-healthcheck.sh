#!/bin/bash
# inbox: instala backup semanal + healthcheck cada 5min, y corre el primer
# backup AHORA para que haya algo que bajar.
# IMPORTANTE: no imprime secretos (el outbox se commitea a git).

set -u
cd /root/secretaria || exit 1

echo "── 1. permisos de los scripts"
chmod +x ops/scripts/backup-weekly.sh ops/scripts/healthcheck-notify.sh

echo "── 2. crontab (idempotente)"
( crontab -l 2>/dev/null | grep -v 'backup-weekly.sh' | grep -v 'healthcheck-notify.sh' ; \
  echo '0 3 * * 0 cd /root/secretaria && bash ops/scripts/backup-weekly.sh >> /var/log/maria-backup.log 2>&1' ; \
  echo '*/5 * * * * cd /root/secretaria && bash ops/scripts/healthcheck-notify.sh >> /var/log/maria-healthcheck.log 2>&1' ) | crontab -
crontab -l | grep -E 'backup-weekly|healthcheck-notify'

echo "── 3. dependencias"
for bin in python3 openssl rsync curl; do
  command -v "$bin" >/dev/null && echo "OK $bin" || echo "FALTA $bin"
done

echo "── 4. primer backup (puede tardar)"
bash ops/scripts/backup-weekly.sh
echo "exit backup: $?"

echo "── 5. healthcheck en seco (solo overall por instancia)"
shopt -s nullglob
for cf in config/instances/*.conf; do
  slug=$(basename "$cf" .conf)
  ASISTENTE_SLUG=$slug bash ops/healthcheck.sh 2>/dev/null | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    checks = {k: v.get("ok") for k, v in d.get("checks", {}).items()}
    print(d.get("instance"), "overall_ok=", d.get("overall_ok"), checks)
except Exception as e:
    print("healthcheck sin JSON:", e)
'
done

echo "── listo. Recordatorio: copiar /root/secretaria/.backup-pass FUERA del VPS (no se imprime aca a proposito)."
