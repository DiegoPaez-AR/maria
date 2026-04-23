#!/bin/bash
# Maria dejó de responder WA. Diagnóstico.
# pm2 reporta online pero los logs están llenos de errores viejos.
# Traemos logs del archivo real (no el buffer in-memory), estado actual,
# último evento registrado, estado de procesos, etc.

set -u
DB=/root/secretaria/db/maria.sqlite
REPO=/root/secretaria

echo "=== pm2 status (verbose) ==="
pm2 status 2>&1 | sed 's/\x1b\[[0-9;]*m//g'

echo
echo "=== pm2 describe maria ==="
pm2 describe maria 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | head -60

echo
echo "=== paths de log ==="
pm2 jlist 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); [print(p.get('pm_id'), p.get('name'), '\nout:', p.get('pm2_env',{}).get('pm_out_log_path'), '\nerr:', p.get('pm2_env',{}).get('pm_err_log_path')) for p in d]" 2>&1 | head -20

echo
echo "=== tail 200 del archivo de logs OUT (no el buffer) ==="
OUTLOG=$(pm2 jlist 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); print([p for p in d if p.get('name')=='maria'][0]['pm2_env']['pm_out_log_path'])" 2>/dev/null)
echo "log path: $OUTLOG"
if [ -f "$OUTLOG" ]; then
  tail -200 "$OUTLOG"
else
  echo "(no existe)"
fi

echo
echo "=== tail 200 del archivo de logs ERR ==="
ERRLOG=$(pm2 jlist 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); print([p for p in d if p.get('name')=='maria'][0]['pm2_env']['pm_err_log_path'])" 2>/dev/null)
echo "log path: $ERRLOG"
if [ -f "$ERRLOG" ]; then
  tail -200 "$ERRLOG"
else
  echo "(no existe)"
fi

echo
echo "=== procesos relacionados (chrome/node/claude) ==="
ps -ef | grep -E "node|chrome|claude" | grep -v grep | head -20

echo
echo "=== últimos 20 eventos (todos los canales) ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, usuario_id, canal, direccion, substr(de,1,22) AS de, substr(cuerpo,1,90) AS cuerpo FROM eventos ORDER BY id DESC LIMIT 20;"

echo
echo "=== últimos 20 errores/sistema ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, usuario_id, direccion, substr(cuerpo,1,160) AS cuerpo FROM eventos WHERE canal='sistema' ORDER BY id DESC LIMIT 20;"

echo
echo "=== git log últimos commits (qué código corre ahora) ==="
cd "$REPO" && git log --oneline -10

echo
echo "=== git status (por si quedó algo colgado) ==="
cd "$REPO" && git status

echo
echo "=== estado_usuario actual (ver si hay unknown_pending etc) ==="
sqlite3 -header -column "$DB" "SELECT usuario_id, clave, substr(valor_json,1,160) AS valor, actualizado FROM estado_usuario ORDER BY actualizado DESC LIMIT 20;"

echo
echo "=== última vez que pm2 restarteó ==="
pm2 jlist 2>/dev/null | python3 -c "
import sys, json, datetime
d = json.load(sys.stdin)
m = [p for p in d if p.get('name')=='maria']
if not m: print('no maria'); exit()
p = m[0]
env = p.get('pm2_env', {})
for k in ('pm_uptime','created_at','restart_time','exit_code','status','unstable_restarts'):
    v = env.get(k)
    if k in ('pm_uptime','created_at') and isinstance(v,(int,float)):
        print(k, '=', datetime.datetime.fromtimestamp(v/1000).isoformat())
    else:
        print(k, '=', v)
" 2>&1 | head -10
