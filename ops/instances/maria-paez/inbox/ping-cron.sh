#!/bin/bash
echo "PING desde Claude $(date -Iseconds)"
echo "Hora VPS: $(date -Iseconds)"
echo "Token en uso por cron (sanitizado):"
grep -oE 'ghp_[A-Za-z0-9]{4}' /root/.git-credentials-maria 2>/dev/null | head -1 | sed 's/$/...***/'
echo "Último push del cron según .cron.log (últimas 15 líneas):"
tail -15 /root/secretaria/ops/.cron.log 2>/dev/null
