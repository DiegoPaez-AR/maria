#!/bin/bash
set -a; cf=/root/secretaria/config/instances/maria-paez.conf; . "$cf"; set +a
DB="${MARIA_DB}"
echo "== schema claude_sesion =="
sqlite3 "$DB" ".schema claude_sesion"
echo ""
echo "== filas claude_sesion (id, usuario, turnos, creada, largo resumen) =="
sqlite3 -separator ' | ' "$DB" "
SELECT id, usuario_id, 
  COALESCE(json_array_length(turnos_json),'?') turnos,
  creada, length(COALESCE(resumen,'')) lr
FROM claude_sesion ORDER BY id DESC LIMIT 10;" 2>&1
echo ""
echo "== contenido del/los resumen(es) más recientes =="
sqlite3 "$DB" "SELECT '--- sesion '||id||' (u'||usuario_id||') ---'||char(10)||COALESCE(resumen,'(sin resumen)') FROM claude_sesion ORDER BY id DESC LIMIT 3;" 2>&1
