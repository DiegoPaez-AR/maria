#!/usr/bin/env bash
# Verifica que el deploy del commit "callar avisos+acks" haya tomado y
# que solo queden los 3 _notificarOwner esperados (prospecto pendiente,
# FSM close WA, FSM close email).
set -u

cd /root/secretaria

echo "=== pm2 status ==="
pm2 status --no-color || true

echo
echo "=== pm2 describe maria (status + created_at) ==="
pm2 describe maria 2>/dev/null | \
  grep -E '(status|uptime|restart time|created at|pid)' | head -10 || true

echo
echo "=== node --check unknown-flow.js ==="
node --check unknown-flow.js && echo OK || echo FAIL

echo
echo "=== último commit ==="
git log -1 --oneline

echo
echo "=== grep: _notificarOwner (esperamos exactamente 3) ==="
grep -c '_notificarOwner(' unknown-flow.js
echo "(1 definición + 3 usos = 4 líneas totales si contamos la función)"
grep -n 'await _notificarOwner\|async function _notificarOwner' unknown-flow.js

echo
echo "=== grep: acks 'se lo paso' (esperamos 0) ==="
grep -nc 'se lo paso\|Se lo paso' unknown-flow.js || true
grep -n 'se lo paso\|Se lo paso' unknown-flow.js || echo "(ninguno — OK)"

echo
echo "=== grep: emojis de los 3 avisos conservados (🕵️ 🚪 ❌) ==="
grep -n '🕵️\|🚪\|❌' unknown-flow.js

echo
echo "=== grep: emojis que deberían haber desaparecido (🔎 🔗 ➡️) ==="
grep -n '🔎\|🔗\|➡️' unknown-flow.js || echo "(ninguno — OK, fueron removidos)"

echo
echo "=== tail 40 OUT log (ver reinicio + posible tráfico) ==="
tail -40 /root/.pm2/logs/maria-out.log 2>/dev/null || echo "(no hay out log)"

echo
echo "=== tail 20 ERR log ==="
tail -20 /root/.pm2/logs/maria-error.log 2>/dev/null || echo "(no hay err log)"

echo
echo "=== estado_usuario: thread unknown/pending (debería estar limpio después del 10) ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "
  SELECT usuario_id, clave, actualizado
  FROM estado_usuario
  WHERE clave LIKE 'unknown:%' OR clave LIKE 'unknown_pending:%';
" 2>/dev/null || true
