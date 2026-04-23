#!/bin/bash
# Dump del contenido de todas las tablas de Maria.
# Cada tabla en bloque separado, con header y formato columna.
# Los campos largos (cuerpo de logs, valor_json, meta) se truncan para no
# reventar la salida.

set -u
DB=/root/secretaria/db/maria.sqlite

echo "=== DB: $DB ==="
echo "=== tablas ==="
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
echo

for t in $(sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"); do
  echo "──────────────────────────────────────────────────────────────"
  echo "=== $t ==="
  echo "schema:"
  sqlite3 "$DB" ".schema $t"
  count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM $t;")
  echo "count: $count"
  if [ "$count" -gt 0 ]; then
    echo "contenido:"
    case "$t" in
      log)
        sqlite3 -header -column "$DB" "SELECT id, ts, canal, direccion, de, substr(cuerpo,1,60) AS cuerpo, substr(metadata,1,40) AS meta FROM log ORDER BY id DESC LIMIT 30;"
        echo "(mostrando últimos 30)"
        ;;
      estado)
        sqlite3 -header -column "$DB" "SELECT clave, substr(valor_json,1,80) AS valor FROM estado ORDER BY clave;"
        ;;
      estado_usuario)
        sqlite3 -header -column "$DB" "SELECT usuario_id, clave, substr(valor_json,1,80) AS valor FROM estado_usuario ORDER BY usuario_id, clave;"
        ;;
      pendientes)
        sqlite3 -header -column "$DB" "SELECT id, usuario_id, substr(desc,1,40) AS desc, estado, creado, substr(meta,1,40) AS meta, ultimo_recordatorio FROM pendientes ORDER BY id DESC;"
        ;;
      eventos)
        sqlite3 -header -column "$DB" "SELECT id, usuario_id, substr(summary,1,40) AS summary, start, fin, substr(ubicacion,1,30) AS ubicacion FROM eventos ORDER BY start DESC LIMIT 30;"
        ;;
      contactos)
        sqlite3 -header -column "$DB" "SELECT id, usuario_id, nombre, substr(canal,1,10) AS canal, valor, substr(alias,1,30) AS alias FROM contactos ORDER BY usuario_id, nombre;"
        ;;
      hechos)
        sqlite3 -header -column "$DB" "SELECT id, usuario_id, substr(hecho,1,80) AS hecho, creado FROM hechos ORDER BY id DESC;"
        ;;
      programados)
        sqlite3 -header -column "$DB" "SELECT id, usuario_id, cuando, canal, destino, substr(texto,1,40) AS texto, estado, substr(razon,1,40) AS razon FROM programados ORDER BY id DESC LIMIT 30;"
        ;;
      usuarios)
        sqlite3 -header -column "$DB" "SELECT id, nombre, rol, wa_cus, wa_lid, email, calendar_id, tz, brief_hora, brief_minuto, activo, creado FROM usuarios ORDER BY id;"
        ;;
      *)
        sqlite3 -header -column "$DB" "SELECT * FROM $t LIMIT 30;"
        ;;
    esac
  fi
  echo
done
