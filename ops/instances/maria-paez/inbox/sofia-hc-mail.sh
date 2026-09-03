#!/bin/bash
grep -h "hc-notify.*sofia" /var/log/maria-healthcheck*.log /root/secretaria/ops/instances/*/snapshots/*.log /var/log/syslog 2>/dev/null | tail -5
grep -rn "hc-notify" /etc/cron.d/ /var/spool/cron/crontabs/root 2>/dev/null | head -3
ls -la /root/secretaria/ops/instances/sofia-bruscoli/snapshots/ 2>/dev/null | head
grep -E "18:2[89]|18:30" /root/.pm2/logs/sofia-bruscoli-out.log | grep -iE "wa-send|email|healthcheck" | head -5
echo LISTO
