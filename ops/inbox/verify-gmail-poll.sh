#!/bin/bash
echo "── pm2 env ──"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p['name']=='maria':
        env = p.get('pm2_env',{})
        print('uptime_ms:', env.get('pm_uptime'))
        print('restart_time:', env.get('restart_time'))
        print('GMAIL_POLL_MS env:', env.get('GMAIL_POLL_MS','(unset → usa default)'))
"
echo
echo "── log de arranque (Gmail poll cada Xs / arrancando poll) ──"
pm2 logs maria --lines 1000 --nostream 2>&1 | grep -E 'Gmail poll: cada|arrancando poll de Gmail' | tail -5
