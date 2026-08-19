#!/bin/bash
echo "═══ crontab del root ═══"
crontab -l 2>/dev/null | grep -v "^#" | head -12
echo "═══ script de backup ═══"
ls -la /root/secretaria/ops/backup*.sh 2>/dev/null
echo "═══ branch backups: últimos commits ═══"
cd /root/secretaria && git log origin/backups --format="  %cr — %s" -3 2>/dev/null
echo "═══ log del backup ═══"
ls -la /root/secretaria/state/backup*.log /root/backup*.log 2>/dev/null | head -3
tail -12 /root/secretaria/state/backup.log 2>/dev/null || tail -12 /root/backup.log 2>/dev/null || echo "  (sin log)"
echo "═══ pass presente? ═══"
[ -f /root/secretaria/.backup-pass ] && echo "  .backup-pass existe" || echo "  ⚠️ FALTA .backup-pass"
echo "═══ healthcheck ═══"
ls -la /root/secretaria/ops/healthcheck.sh 2>/dev/null && crontab -l 2>/dev/null | grep -c healthcheck
echo LISTO
