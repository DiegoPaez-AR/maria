#!/bin/bash
set +e
echo "═══ pm2 logs últimos 50 (en vivo) ═══"
pm2 logs maria-paez --lines 50 --nostream 2>&1 | tail -60

echo ""
echo "═══ pm2 jlist info detallada ═══"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name') != 'maria-paez': continue
    e = p.get('pm2_env', {})
    print('  status:', e.get('status'))
    print('  restarts:', e.get('restart_time'))
    print('  unstable_restarts:', e.get('unstable_restarts'))
    print('  prev_restart_delay:', e.get('prev_restart_delay'))
    print('  exit_code:', e.get('exit_code'))
"

echo ""
echo "═══ Error log de pm2 ═══"
tail -40 /root/.pm2/logs/maria-paez-error.log 2>&1
