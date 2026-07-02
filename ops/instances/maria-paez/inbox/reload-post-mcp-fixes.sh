#!/bin/bash
cd /root/secretaria
R_ANTES=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys; print([p['pm2_env']['restart_time'] for p in json.load(sys.stdin) if p['name']=='maria-paez'][0])")
pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1
sleep 3
R_DESP=$(pm2 jlist 2>/dev/null | python3 -c "import json,sys; print([p['pm2_env']['restart_time'] for p in json.load(sys.stdin) if p['name']=='maria-paez'][0])")
echo "restart_time: $R_ANTES → $R_DESP $([ "$R_DESP" -gt "$R_ANTES" ] && echo '(reload OK)' || echo '(NO recargó!)')"
pm2 jlist 2>/dev/null | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo LISTO
