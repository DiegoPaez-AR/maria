#!/bin/bash
set +e
CTRL=/root/secretaria/state/control/control.sqlite
real=$(sqlite3 "$CTRL" "SELECT COUNT(*) FROM clientes WHERE instancia_slug='maria-paez' AND estado='active';")
echo "cupo contador ANTES: $(sqlite3 "$CTRL" "SELECT usuarios_actuales FROM instances WHERE slug='maria-paez';") | clientes activos reales: $real"
sqlite3 "$CTRL" "UPDATE instances SET usuarios_actuales=(SELECT COUNT(*) FROM clientes WHERE instancia_slug='maria-paez' AND estado='active'), actualizado=datetime('now') WHERE slug='maria-paez';"
echo "cupo contador DESPUES: $(sqlite3 "$CTRL" "SELECT usuarios_actuales FROM instances WHERE slug='maria-paez';")"
echo ""
echo "=== resumen final santiago ==="
echo "usuario17: $(sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT nombre||' activo='||activo FROM usuarios WHERE id=17;")"
echo "cliente#2: $(sqlite3 "$CTRL" "SELECT nombre||' estado='||estado FROM clientes WHERE id=2;")"
