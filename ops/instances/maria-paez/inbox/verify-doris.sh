#!/bin/bash
set -u
DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ Doris en usuarios ═══"
sqlite3 -line "$DB" "SELECT id, wa_lid, wa_cus, actualizado FROM usuarios WHERE id=6;"

echo
echo "═══ estado_usuario id=6 ═══"
sqlite3 -line "$DB" "SELECT * FROM estado_usuario WHERE usuario_id=6;"

echo
echo "═══ Últimos 8 eventos usuario_id=6 ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, canal, direccion, substr(de,1,40) AS de, substr(COALESCE(cuerpo,''),1,100) AS cuerpo
  FROM eventos WHERE usuario_id=6 ORDER BY id DESC LIMIT 8;"

echo
echo "═══ pm2 logs después de las 10:02 (post-reload) ═══"
pm2 logs maria-paez --lines 200 --nostream --raw 2>&1 | awk '/2026-05-13 1[0-9]:/{p=1} p' | tail -40
