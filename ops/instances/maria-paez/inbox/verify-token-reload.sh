#!/bin/bash
# Verificar token.json renovado y reload pm2 si tiene timestamp nuevo.
set +e

TOK=/root/secretaria/state/maria-paez/token.json
echo "═══ Estado del token actual ═══"
ls -la /root/secretaria/state/maria-paez/token.json* 2>/dev/null

echo ""
echo "Campos (sin secretos):"
python3 - <<'PYEOF'
import json
from datetime import datetime, timezone
t = json.load(open('/root/secretaria/state/maria-paez/token.json'))
for k in t.keys():
    v = t[k]
    if k in ('access_token','refresh_token','id_token'):
        v = f'(presente, len={len(str(v))})'
    elif k == 'expiry_date':
        try:
            d = datetime.fromtimestamp(v/1000, tz=timezone.utc)
            v = f'{v} → {d.isoformat()}'
        except: pass
    print(f'  {k} = {v}')
PYEOF

echo ""
echo "═══ Comparar mtime de token.json vs uptime de Maria ═══"
TOK_MTIME=$(stat -c %Y "$TOK" 2>/dev/null)
NOW=$(date +%s)
PM2_UPTIME_S=$(pm2 jlist 2>/dev/null | python3 -c "
import json, sys
ps = json.load(sys.stdin)
for p in ps:
    if p.get('name')=='maria-paez':
        # pm2_env.pm_uptime es ms epoch del último start
        print(int(p['pm2_env']['pm_uptime']/1000))
        break
")
echo "  token mtime epoch: $TOK_MTIME ($(date -d @$TOK_MTIME +'%Y-%m-%d %H:%M:%S'))"
echo "  maria-paez start:  $PM2_UPTIME_S ($(date -d @$PM2_UPTIME_S +'%Y-%m-%d %H:%M:%S'))"

if [ -n "$TOK_MTIME" ] && [ -n "$PM2_UPTIME_S" ] && [ "$TOK_MTIME" -gt "$PM2_UPTIME_S" ]; then
  echo ""
  echo "→ token MÁS NUEVO que el proceso pm2. Reload necesario."
  echo ""
  echo "═══ pm2 reload maria-paez ═══"
  cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -10
  echo ""
  echo "esperando 20s para que arranque…"
  sleep 20
  echo ""
  echo "═══ Logs post-reload (60s) ═══"
  pm2 logs maria-paez --lines 80 --nostream 2>&1 | tail -40
  echo ""
  echo "═══ ¿Sigue habiendo invalid_grant después del reload? ═══"
  pm2 logs maria-paez --lines 200 --nostream 2>&1 | grep invalid_grant | tail -5
else
  echo ""
  echo "→ token NO es más nuevo que el proceso. Diego todavía no corrió auth-gmail.js, o token quedó en otro path."
fi
