#!/bin/bash
# Verificar que Maria levantó post-refactor multi-user
# - migraciones corrieron sin error (log "[memory] migración: ...")
# - owner bootstrapeado
# - pm2 está online
# - schema tiene lo nuevo (usuarios, estado_usuario, usuario_id en tablas)

set -u

echo "=== pm2 status maria ==="
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p['name'] != 'maria': continue
        s = p.get('pm2_env', {})
        print(f\"  status={s.get('status')} restarts={s.get('restart_time')} uptime_ms={p.get('pm2_env',{}).get('pm_uptime')}\")
except Exception as e:
    print(f'  (error parseando pm2 jlist: {e})')
"

echo
echo "=== últimos logs de Maria (60 líneas, sin color) ==="
pm2 logs maria --lines 60 --nostream 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -60

echo
echo "=== tablas en la DB ==="
sqlite3 /root/secretaria/db/maria.sqlite "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

echo
echo "=== usuarios registrados ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "SELECT id, nombre, rol, wa_lid IS NOT NULL AS lid, wa_cus IS NOT NULL AS cus, email IS NOT NULL AS has_email, calendar_id IS NOT NULL AS has_cal, tz, brief_hora, activo FROM usuarios;"

echo
echo "=== counts per-usuario ==="
sqlite3 /root/secretaria/db/maria.sqlite <<'SQL'
SELECT 'eventos'     AS tabla, usuario_id, COUNT(*) FROM eventos     GROUP BY usuario_id;
SELECT 'pendientes'  AS tabla, usuario_id, COUNT(*) FROM pendientes  GROUP BY usuario_id;
SELECT 'contactos'   AS tabla, usuario_id, COUNT(*) FROM contactos   GROUP BY usuario_id;
SELECT 'hechos'      AS tabla, usuario_id, COUNT(*) FROM hechos      GROUP BY usuario_id;
SELECT 'programados' AS tabla, usuario_id, COUNT(*) FROM programados GROUP BY usuario_id;
SQL

echo
echo "=== estado_usuario (keys que migraron) ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "SELECT usuario_id, clave, substr(valor_json, 1, 40) AS valor FROM estado_usuario ORDER BY usuario_id, clave;"
