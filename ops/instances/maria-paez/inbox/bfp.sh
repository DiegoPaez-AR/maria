#!/bin/bash
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT COUNT(*) FROM contactos WHERE perfil_web IS NOT NULL;"
pgrep -f backfill-perfiles.js >/dev/null && echo RUNNING || echo STOPPED
tail -4 /tmp/backfill-perfiles.log 2>/dev/null
