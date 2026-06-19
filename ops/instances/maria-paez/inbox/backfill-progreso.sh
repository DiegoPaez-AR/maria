#!/bin/bash
set +e
echo "corriendo? $(pgrep -f backfill-perfiles.js >/dev/null && echo SÍ || echo NO)"
echo "perfil_web cargados: $(sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT COUNT(*) FROM contactos WHERE perfil_web IS NOT NULL;") / 120"
echo "--- últimas líneas del log ---"
tail -12 /tmp/backfill-perfiles.log 2>/dev/null
