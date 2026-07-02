#!/bin/bash
# Verifica que intensa-api tomó el STRIPE_WEBHOOK_SECRET nuevo. NO imprime valores.
SEC=/root/secretaria/config/secrets.conf
V=$(grep -E '^STRIPE_WEBHOOK_SECRET=' "$SEC" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
case "$V" in
  whsec_*) echo "formato en secrets.conf: OK (whsec_..., len=${#V})";;
  *) echo "⚠️ formato RARO en secrets.conf (no empieza con whsec_, len=${#V})";;
esac
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
v='$V'
for p in json.load(sys.stdin):
    if p['name']=='intensa-api':
        e=p['pm2_env']; env={**e, **(e.get('env') or {})}
        got=env.get('STRIPE_WEBHOOK_SECRET','')
        print('env vivo intensa-api:', 'MATCH con secrets.conf' if got==v else f'MISMATCH (len env={len(got)})')
        print('status:', e.get('status'), 'restarts:', e.get('restart_time'))
"
# firma inválida debe dar 401 (sanity del handler):
H=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:4080/webhook -H "stripe-signature: t=1,v1=deadbeef" -d '{}')
echo "webhook con firma inválida → HTTP $H (esperado 401)"
echo "LISTO"
