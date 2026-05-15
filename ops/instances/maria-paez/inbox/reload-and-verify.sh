#!/bin/bash
# Reload pm2 con el token nuevo (post-publish) y verificar invalid_grant.
set +e

echo "═══ Estado del token nuevo ═══"
ls -la /root/secretaria/state/maria-paez/token.json* 2>/dev/null

echo ""
echo "Campos clave del token (sin secretos):"
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
if 'refresh_token_expires_in' in t:
    rt = t['refresh_token_expires_in']
    print(f'\n⚠️  refresh_token_expires_in PRESENTE: {rt}s ({rt/86400:.1f} dias)')
else:
    print('\n✅ refresh_token_expires_in AUSENTE — el refresh token no caduca automaticamente')
PYEOF

echo ""
echo "═══ pm2 reload ═══"
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env 2>&1 | tail -5

echo ""
echo "esperando 25s para que arranque y dispare primer poll…"
sleep 25

echo ""
echo "═══ ¿Sigue habiendo invalid_grant después del reload? ═══"
RELOAD_TS=$(date +%s)
pm2 logs maria-paez --lines 100 --nostream 2>&1 | tail -60 | grep -E 'invalid_grant' | tail -5
N=$(pm2 logs maria-paez --lines 200 --nostream 2>&1 | tail -60 | grep -c invalid_grant)
echo ""
echo "→ invalid_grant en los últimos 60 logs: $N"

echo ""
echo "═══ Indicadores de que Gmail/Calendar funcionan ═══"
pm2 logs maria-paez --lines 200 --nostream 2>&1 | tail -80 | grep -iE 'GMAIL poll|GMAIL ←|meeting-prep.*\+|calendar-watch.*activo' | tail -15
