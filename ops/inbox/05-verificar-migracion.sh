#!/bin/bash
# Verificar que tras el fix del memory.js:
#  - Maria arrancó sin errores de SQLITE
#  - las tablas operativas tienen columna usuario_id
#  - estado_usuario existe
#  - usuarios tiene al owner bootstrapeado
#  - los datos legacy se backfillearon a usuario_id=1

set -u
DB=/root/secretaria/db/maria.sqlite

echo "=== pm2 status maria ==="
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p['name'] != 'maria': continue
        s = p.get('pm2_env', {})
        print(f\"  status={s.get('status')} restarts={s.get('restart_time')}\")
except Exception as e:
    print(f'  (error pm2 jlist: {e})')
"

echo
echo "=== últimos 40 logs (sin color) ==="
pm2 logs maria --lines 40 --nostream 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -40

echo
echo "=== tablas ==="
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

echo
echo "=== columnas usuario_id por tabla ==="
for t in eventos pendientes programados contactos hechos; do
  has=$(sqlite3 "$DB" "SELECT COUNT(*) FROM pragma_table_info('$t') WHERE name='usuario_id';")
  echo "  $t.usuario_id = $has"
done
has_eu=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='estado_usuario';")
echo "  estado_usuario existe = $has_eu"

echo
echo "=== usuarios ==="
sqlite3 -header -column "$DB" "SELECT id, nombre, rol, wa_cus, wa_lid, email, calendar_id, tz, brief_hora, activo FROM usuarios ORDER BY id;"

echo
echo "=== counts por usuario_id ==="
for t in eventos pendientes programados contactos hechos; do
  has=$(sqlite3 "$DB" "SELECT COUNT(*) FROM pragma_table_info('$t') WHERE name='usuario_id';")
  if [ "$has" = "1" ]; then
    echo "─ $t ─"
    sqlite3 -header -column "$DB" "SELECT usuario_id, COUNT(*) AS n FROM $t GROUP BY usuario_id;"
  fi
done

echo
echo "=== estado_usuario (migración de claves per-user) ==="
sqlite3 -header -column "$DB" "SELECT usuario_id, clave, substr(valor_json,1,60) AS valor FROM estado_usuario ORDER BY usuario_id, clave;" 2>/dev/null || echo "  (tabla no existe todavía)"

echo
echo "=== estado (debe NO tener diego_wa_lid ni morning_brief_ultimo_dia si migró) ==="
sqlite3 -header -column "$DB" "SELECT clave, substr(valor_json,1,60) AS valor FROM estado ORDER BY clave;"
