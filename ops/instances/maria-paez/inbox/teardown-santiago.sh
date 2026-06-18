#!/bin/bash
set +e
CTRL=/root/secretaria/state/control/control.sqlite
echo "== ANTES: cliente #2 + cupo maria-paez =="
sqlite3 -line "$CTRL" "SELECT id,nombre,email,estado,instancia_usuario_id FROM clientes WHERE id=2;"
sqlite3 "$CTRL" "SELECT slug,usuarios_actuales,max_usuarios FROM instances WHERE slug='maria-paez';"
echo ""
echo "== marcar cliente cancelled (solo si es santiago y está active) =="
sqlite3 "$CTRL" "UPDATE clientes SET estado='cancelled', cancelado_en=datetime('now'), ultimo_evento='manual_teardown_test', ultimo_evento_en=datetime('now') WHERE id=2 AND email='santiago@paez.is' AND estado='active';"
echo "filas afectadas (cliente): $(sqlite3 "$CTRL" "SELECT changes();")"
echo "== bajar cupo de maria-paez (MAX 0) =="
sqlite3 "$CTRL" "UPDATE instances SET usuarios_actuales = MAX(0, usuarios_actuales - 1), actualizado=datetime('now') WHERE slug='maria-paez';"
echo "filas afectadas (instances): $(sqlite3 "$CTRL" "SELECT changes();")"
echo ""
echo "== DESPUES =="
sqlite3 -line "$CTRL" "SELECT id,estado,cancelado_en,ultimo_evento FROM clientes WHERE id=2;"
sqlite3 "$CTRL" "SELECT slug,usuarios_actuales,max_usuarios FROM instances WHERE slug='maria-paez';"
echo "== usuario 17 (debe seguir activo=0) =="
sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT id,nombre,activo FROM usuarios WHERE id=17;"
