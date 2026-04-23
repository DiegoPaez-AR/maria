#!/bin/bash
# Diagnóstico del invalid_grant: ver el error completo en los logs y estado del token.

cd /root/secretaria

echo "=== archivos de auth ==="
ls -la credentials.json token.json 2>&1

echo ""
echo "=== token.json (sin el refresh_token) ==="
if [ -f token.json ]; then
  python3 -c "
import json
t = json.load(open('token.json'))
# Oculta el secret pero muestra metadata
safe = {k: (v if k != 'refresh_token' else '***'+(v[-6:] if v else 'NULL')) for k,v in t.items()}
print(json.dumps(safe, indent=2))
"
else
  echo "NO EXISTE"
fi

echo ""
echo "=== credentials.json (client_id solamente) ==="
if [ -f credentials.json ]; then
  python3 -c "
import json
c = json.load(open('credentials.json'))
inst = c.get('installed') or c.get('web') or {}
print('client_id:', inst.get('client_id','?'))
print('project_id:', inst.get('project_id','?'))
print('tipo:', 'installed' if 'installed' in c else ('web' if 'web' in c else '?'))
"
else
  echo "NO EXISTE"
fi

echo ""
echo "=== pm2 logs buscando invalid_grant / OAuth ==="
pm2 logs maria --lines 400 --nostream 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -iE "invalid_grant|oauth|gmail|calendar|google.*error|token" | tail -30

echo ""
echo "=== últimos eventos de sistema en DB ==="
sqlite3 /root/secretaria/db/maria.sqlite \
  'SELECT id, timestamp, substr(COALESCE(cuerpo,""),1,200) FROM eventos WHERE canal="sistema" ORDER BY id DESC LIMIT 15' 2>&1
