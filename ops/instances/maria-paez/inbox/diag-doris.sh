#!/bin/bash
# Diagnóstico Doris Capurro — investigación del fallo crónico de morning-brief
set -u
DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ 1. Esquema tabla usuarios ═══"
sqlite3 "$DB" "PRAGMA table_info(usuarios);"

echo
echo "═══ 2. Fila completa de Doris ═══"
sqlite3 -line "$DB" "SELECT * FROM usuarios WHERE nombre LIKE '%Doris%';"

echo
echo "═══ 3. Listar TODOS los usuarios activos (resumen) ═══"
sqlite3 -header -column "$DB" "SELECT id, nombre, activo, tz, brief_hora, brief_minuto,
    CASE WHEN calendar_id IS NULL OR calendar_id='' THEN '(vacío)' ELSE calendar_id END AS calendar_id,
    COALESCE(calendar_acceso,'(null)') AS calendar_acceso,
    CASE WHEN email IS NULL OR email='' THEN '(vacío)' ELSE email END AS email,
    CASE WHEN wa_lid IS NULL OR wa_lid='' THEN '(vacío)' ELSE wa_lid END AS wa_lid,
    CASE WHEN wa_cus IS NULL OR wa_cus='' THEN '(vacío)' ELSE wa_cus END AS wa_cus
  FROM usuarios ORDER BY id;"

echo
echo "═══ 4. Últimas 200 líneas de pm2 logs (sin filtrar) ═══"
pm2 logs maria-paez --lines 300 --nostream --raw 2>&1 | tail -300

echo
echo "═══ 5. pm2 error log raw (stacks completos) ═══"
ERRLOG=$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
for p in d:
    if p.get('name')=='maria-paez':
        print(p.get('pm2_env',{}).get('pm_err_log_path',''))
        break
")
echo "err log path: $ERRLOG"
if [ -n "$ERRLOG" ] && [ -f "$ERRLOG" ]; then
  echo "--- últimas 100 lines del err log ---"
  tail -100 "$ERRLOG"
fi

echo
echo "═══ 6. estado_usuario para morning-brief de Doris ═══"
sqlite3 -line "$DB" "SELECT * FROM estado_usuario WHERE clave='morning_brief_ultimo_dia';"
