#!/bin/bash
echo "═══ log del cron de backup ═══"
tail -25 /var/log/maria-backup.log 2>/dev/null || echo "  (log vacío/inexistente)"
echo "═══ existe el script? ═══"
ls -la /root/secretaria/ops/scripts/backup-weekly.sh 2>/dev/null || echo "  ⚠️ NO EXISTE ops/scripts/backup-weekly.sh"
ls /root/secretaria/ops/scripts/ 2>/dev/null | head -12
echo LISTO
