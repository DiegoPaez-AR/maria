#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== pm2 =="
pm2 jlist | python3 -c "import json,sys; [print(p['name'], p['pm2_env']['status'], 'restarts=', p['pm2_env']['restart_time']) for p in json.load(sys.stdin) if p['name']=='maria-paez']"
echo "== últimos requests nginx al hook =="
grep -h "wa-maria" /var/log/nginx/access.log 2>/dev/null | tail -5 | awk '{print $4, "->", $9}'
echo "== eventos autoresponder última hora =="
sqlite3 "$DB" "SELECT timestamp, direccion, substr(cuerpo,1,50) FROM eventos WHERE metadata_json LIKE '%autoresponder%' AND timestamp > datetime('now','-1 hour') ORDER BY id DESC LIMIT 6;"
echo "== errores recientes =="
tail -20 /root/.pm2/logs/maria-paez-error.log 2>/dev/null | grep -a "$(date +%Y-%m-%d)" | tail -6
echo "== smoke test interno del hook =="
SEC=$(grep WA_HOOK_SECRET /root/secretaria/config/secrets.conf | cut -d= -f2)
curl -s -m 10 -X POST "http://127.0.0.1:4501/wa-hook/$SEC" -H 'Content-Type: application/json' -d '{"query":{"sender":"x","message":"t","isGroup":false,"isTestMessage":true},"appPackageName":"x","messengerPackageName":"x"}' | head -c 150
echo
