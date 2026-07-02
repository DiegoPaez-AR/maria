#!/bin/bash
echo "── marker (debe NO existir) ──"
cat /root/secretaria/state/.canary-bad-commit 2>/dev/null || echo "(sin marker — OK)"
echo "── pm2 (restarts debe haber subido) ──"
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts='+str(p['pm2_env']['restart_time'])) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo "── canary log ──"
grep -E "canary (OK|FALLÓ|FALLO)" /root/secretaria/ops/.cron.log | tail -3
echo FIN
