#!/bin/bash
set +e
CTRL=/root/secretaria/state/control/control.sqlite
echo "cupo ANTES: $(sqlite3 "$CTRL" "SELECT usuarios_actuales FROM instances WHERE slug='maria-paez';")"
echo "clientes activos reales: $(sqlite3 "$CTRL" "SELECT COUNT(*) FROM clientes WHERE instancia_slug='maria-paez' AND estado='active';")"
# Bajar 1 (santiago, cuyo signup incrementó y el teardown no decrementó)
sqlite3 "$CTRL" "UPDATE instances SET usuarios_actuales = MAX(0, usuarios_actuales - 1), actualizado=datetime('now') WHERE slug='maria-paez';"
echo "cupo DESPUES: $(sqlite3 "$CTRL" "SELECT usuarios_actuales FROM instances WHERE slug='maria-paez';")"
echo "--- estado final santiago ---"
echo "cliente#2: $(sqlite3 "$CTRL" "SELECT estado FROM clientes WHERE id=2;")"
echo "usuario17 activo: $(sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT activo FROM usuarios WHERE id=17;")"
