#!/usr/bin/env bash
# Verifica que el deploy de "tercero_de_usuario" + aviso de cierre mejorado
# haya tomado bien, y deja visible el logging nuevo para que Diego pueda
# confirmar el flujo la próxima vez que escriba un tercero desde un número
# no registrado.
set -u

cd /root/secretaria

echo "=== pm2 status ==="
pm2 status --no-color || true

echo
echo "=== pm2 describe maria (uptime, created_at, restart_time) ==="
pm2 describe maria 2>/dev/null | \
  grep -E '(status|uptime|restart time|created at|script path|pid|script args)' | \
  head -20 || true

echo
echo "=== node --check unknown-flow.js ==="
node --check unknown-flow.js && echo OK || echo FAIL

echo
echo "=== grep categoría tercero_de_usuario ==="
grep -c '"tercero_de_usuario"\|=== '"'"'tercero_de_usuario'"'"'' unknown-flow.js || true
echo "(esperamos ≥ 4: 2 en prompt, 2 en handlers)"
grep -n 'tercero_de_usuario' unknown-flow.js | head -20

echo
echo "=== grep función _routearComoTerceroDeUsuario ==="
grep -n '_routearComoTerceroDeUsuario\|unknown_llm_tercero' unknown-flow.js | head -10

echo
echo "=== grep aviso de cierre nuevo ==="
grep -n 'no pude identificar para quién\|Lo asumí erróneo' unknown-flow.js

echo
echo "=== grep logging de traza ==="
grep -n 'LLM pre-pass inputs:\|LLM resolucion:\|unknown_llm_trace' unknown-flow.js

echo
echo "=== último commit ==="
git log -1 --oneline

echo
echo "=== tail 40 del OUT log (buscar reinicio nuevo y posible tráfico) ==="
tail -40 /root/.pm2/logs/maria-out.log 2>/dev/null || echo "(no hay out log)"

echo
echo "=== tail 20 del ERR log ==="
tail -20 /root/.pm2/logs/maria-error.log 2>/dev/null || echo "(no hay err log)"

echo
echo "=== últimos 5 eventos de traza LLM (si hubo algún tráfico desconocido) ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "
  SELECT id, timestamp, cuerpo
  FROM eventos
  WHERE canal = 'sistema' AND cuerpo LIKE 'unknown-flow/%'
  ORDER BY id DESC LIMIT 5;
" 2>/dev/null || echo "(sin eventos de traza todavía — esperá a que llegue un desconocido)"

echo
echo "=== estado_usuario: prospectos pendientes actuales ==="
sqlite3 -header -column /root/secretaria/db/maria.sqlite "
  SELECT usuario_id, clave, actualizado
  FROM estado_usuario
  WHERE clave LIKE 'unknown_pending:%' OR clave LIKE 'unknown:%';
" 2>/dev/null || true
