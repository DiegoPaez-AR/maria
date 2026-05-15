#!/bin/bash
# Diagnóstico de la auth de Google de Maria
set +e

echo "═══ 1) Archivos token.json y credentials.json ═══"
ls -la /root/secretaria/state/maria-paez/token.json* /root/secretaria/state/maria-paez/credentials.json 2>/dev/null
echo ""
echo "Tamaño y campos del token (sin valores secretos):"
python3 -c "
import json
try:
    t = json.load(open('/root/secretaria/state/maria-paez/token.json'))
    for k in t.keys():
        v = t[k]
        if k in ('access_token','refresh_token','id_token'):
            v = f'(presente, len={len(str(v))})'
        elif k == 'expiry_date':
            from datetime import datetime, timezone
            try:
                d = datetime.fromtimestamp(v/1000, tz=timezone.utc)
                v = f'{v} → {d.isoformat()}'
            except: pass
        print(f'  {k} = {v}')
except Exception as e:
    print(f'error: {e}')
"
echo ""
echo "Cliente OAuth (credentials.json — solo expone client_id/redirect, no secret):"
python3 -c "
import json
try:
    c = json.load(open('/root/secretaria/state/maria-paez/credentials.json'))
    # Estructura típica de Google OAuth client: { installed: {...} } o { web: {...} }
    root = c.get('installed') or c.get('web') or c
    for k in ['client_id','project_id','redirect_uris','token_uri','auth_uri']:
        v = root.get(k)
        if v: print(f'  {k} = {v}')
" 

echo ""
echo "═══ 2) ¿Token tiene refresh_token o solo access_token? ═══"
python3 -c "
import json
t = json.load(open('/root/secretaria/state/maria-paez/token.json'))
print('  refresh_token:', 'SI' if t.get('refresh_token') else 'NO (sin refresh, el access vence y no se renueva)')
print('  scope:', t.get('scope'))
"

echo ""
echo "═══ 3) ¿Hay tokens por usuario en algún lado? (calendars compartidos vs propios) ═══"
find /root/secretaria/state -name '*token*' -o -name '*oauth*' 2>/dev/null | head -20
echo ""
echo "Estructura de state/maria-paez:"
ls -la /root/secretaria/state/maria-paez/

echo ""
echo "═══ 4) Errores invalid_grant recientes en logs (últimos 200) ═══"
pm2 logs maria-paez --lines 500 --nostream 2>&1 | grep -iE 'invalid_grant|invalid.grant|refresh.*token|reauth|google.*expired' | tail -20

echo ""
echo "═══ 5) Si auth-gmail.js o google.js tienen flujo de reconexión OAuth ═══"
grep -nE 'function.*[Aa]uth|getNewToken|oauth.*url|generateAuthUrl|server\.|createServer|listen\(' /root/secretaria/auth-gmail.js 2>/dev/null
echo ""
echo "google.js — exports relevantes:"
grep -nE 'module\.exports|function (auth|generar|refresh|getClient)' /root/secretaria/google.js | head -20
