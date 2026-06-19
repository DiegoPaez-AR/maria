#!/bin/bash
set +e
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "backfill corriendo? $(pgrep -f backfill-perfiles.js >/dev/null && echo SÍ || echo NO/terminado)"
echo "enriquecidos: $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE perfil_web IS NOT NULL;") / 120 con email ($(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos;") total)"
echo ""
echo "=== PERFILES (por usuario) ==="
sqlite3 "$DB" "
SELECT '['||COALESCE(u.nombre,'uid '||c.usuario_id)||'] '||c.nombre||'  <'||COALESCE(c.email,'')||'>'||char(10)||'    → '||c.perfil_web
FROM contactos c LEFT JOIN usuarios u ON u.id=c.usuario_id
WHERE c.perfil_web IS NOT NULL
ORDER BY u.nombre, c.nombre;"
