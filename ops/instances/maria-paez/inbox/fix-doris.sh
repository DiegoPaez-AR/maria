#!/bin/bash
set -u
DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ Antes del UPDATE ═══"
sqlite3 -line "$DB" "SELECT id, nombre, wa_lid, wa_cus FROM usuarios WHERE id=6;"

echo
echo "═══ Aplicando UPDATE ═══"
sqlite3 "$DB" "BEGIN;
UPDATE usuarios
   SET wa_lid='105171031949561@lid',
       wa_cus='5491144471264@c.us',
       actualizado=CURRENT_TIMESTAMP
 WHERE id=6;
COMMIT;"
echo "rows changed:"
sqlite3 "$DB" "SELECT changes();"

echo
echo "═══ Después del UPDATE ═══"
sqlite3 -line "$DB" "SELECT id, nombre, wa_lid, wa_cus, actualizado FROM usuarios WHERE id=6;"

echo
echo "═══ Restart pm2 para que recargue la fila (in-process cache de usuarios.listarActivos) ═══"
# usuarios.js hace queries en vivo, pero por las dudas reload soft.
# Algunos módulos pueden cachear; mejor reload.
pm2 reload maria-paez --update-env 2>&1 | tail -5

echo
echo "═══ Esperando 30s para que arranque y que el morning-brief intente otro tick ═══"
sleep 35

echo
echo "═══ pm2 logs últimos 40 (buscando si Doris ✓ enviado o sigue fallando) ═══"
pm2 logs maria-paez --lines 60 --nostream --raw 2>&1 | tail -60 | grep -E "Doris|morning-brief|ready|error|FAIL" | tail -30

echo
echo "═══ ¿Quedó marcado el estado de morning-brief para Doris hoy? ═══"
sqlite3 -line "$DB" "SELECT * FROM estado_usuario WHERE usuario_id=6;"

echo
echo "═══ Último evento saliente a 105171031949561 ═══"
sqlite3 -line "$DB" "SELECT id, timestamp, direccion, de, substr(COALESCE(cuerpo,''),1,150) AS cuerpo
  FROM eventos
  WHERE de LIKE '%105171031949561%'
  ORDER BY id DESC LIMIT 3;"
