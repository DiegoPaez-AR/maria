#!/bin/bash
set +e
CTRL=/root/secretaria/state/control/control.sqlite
echo "== cliente santiago (#2) =="
sqlite3 -line "$CTRL" "SELECT id,nombre,estado,cancelado_en,ultimo_evento FROM clientes WHERE id=2;"
echo "== cupo maria-paez =="
sqlite3 "$CTRL" "SELECT slug,usuarios_actuales,max_usuarios FROM instances WHERE slug='maria-paez';"
echo "== usuario 17 =="
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT id,nombre,activo FROM usuarios WHERE id=17;"
