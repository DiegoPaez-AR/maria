#!/bin/bash
set +e
CTRL=/root/secretaria/state/control/control.sqlite
echo "ANTES: $(sqlite3 "$CTRL" "SELECT 'cliente#2='||estado FROM clientes WHERE id=2;") | $(sqlite3 "$CTRL" "SELECT 'cupo='||usuarios_actuales FROM instances WHERE slug='maria-paez';")"
sqlite3 "$CTRL" "UPDATE clientes SET estado='cancelled', cancelado_en=datetime('now'), ultimo_evento='manual_teardown_test', ultimo_evento_en=datetime('now') WHERE id=2 AND email='santiago@paez.is' AND estado='active'; "
CLI_CH=$(sqlite3 "$CTRL" "SELECT changes();")
# bajar cupo SOLO si efectivamente cancelamos el cliente recién (CLI_CH=1)
if [ "$CLI_CH" = "1" ]; then
  sqlite3 "$CTRL" "UPDATE instances SET usuarios_actuales = MAX(0, usuarios_actuales - 1), actualizado=datetime('now') WHERE slug='maria-paez';"
  echo "cliente cancelado ($CLI_CH) + cupo decrementado"
else
  echo "cliente NO cambió (cambios=$CLI_CH) — quizá ya estaba cancelled; NO toco cupo"
fi
echo "DESPUES: $(sqlite3 "$CTRL" "SELECT 'cliente#2='||estado||' cancelado_en='||COALESCE(cancelado_en,'-') FROM clientes WHERE id=2;") | $(sqlite3 "$CTRL" "SELECT 'cupo='||usuarios_actuales FROM instances WHERE slug='maria-paez';")"
echo "usuario17_activo=$(sqlite3 /root/secretaria/state/maria-paez/db/maria.sqlite "SELECT activo FROM usuarios WHERE id=17;")"
