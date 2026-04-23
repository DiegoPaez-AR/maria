#!/bin/bash
# Verificar que el refactor de unknown-flow con LLM pre-pass + prospectos
# pendientes arrancó limpio. Corre post-deploy (cron tira git pull + pm2 reload).
#
# Chequea:
#  1) pm2 status (no crash loop).
#  2) Archivos nuevos presentes.
#  3) Que Maria cargó los módulos (`context-fetcher`, `unknown-flow` refactor,
#     nuevas acciones en executor).
#  4) Estado actual de prospectos pendientes en estado_usuario.
#  5) Últimos eventos relevantes (unknown_pending_*, acciones confirmar/rechazar).
#  6) Últimos logs de pm2.

set -u
DB=/root/secretaria/db/maria.sqlite
REPO=/root/secretaria

echo "=== pm2 status ==="
pm2 status 2>&1 | sed 's/\x1b\[[0-9;]*m//g'

echo
echo "=== archivos nuevos / modificados ==="
ls -la "$REPO/context-fetcher.js" 2>&1 || echo "context-fetcher.js NO EXISTE"
echo "--- head de unknown-flow.js (primeras 5 líneas) ---"
head -5 "$REPO/unknown-flow.js"

echo
echo "=== chequeo de sintaxis (node --check) ==="
for f in context-fetcher.js unknown-flow.js google.js usuarios.js executor.js prompt-builder.js; do
  if node --check "$REPO/$f" 2>&1; then
    echo "OK  $f"
  else
    echo "FAIL $f"
  fi
done

echo
echo "=== acciones registradas en executor.js (grep 'case .tipo.') ==="
grep -n "case '" "$REPO/executor.js" | sed 's/^/  /'

echo
echo "=== exports de unknown-flow.js ==="
grep -A 20 "^module.exports" "$REPO/unknown-flow.js" | head -30

echo
echo "=== prospectos pendientes en estado_usuario ==="
sqlite3 -header -column "$DB" "SELECT usuario_id, clave, substr(valor_json,1,200) AS valor, actualizado FROM estado_usuario WHERE clave LIKE 'unknown_pending:%' ORDER BY actualizado DESC;"

echo
echo "=== estados FSM legacy (unknown:* que todavía siguen abiertos) ==="
sqlite3 -header -column "$DB" "SELECT usuario_id, clave, substr(valor_json,1,200) AS valor, actualizado FROM estado_usuario WHERE clave LIKE 'unknown:%' AND clave NOT LIKE 'unknown_pending:%' ORDER BY actualizado DESC;"

echo
echo "=== últimos 30 eventos con metadata tipo unknown_* ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, usuario_id, canal, direccion, substr(de,1,25) AS de, substr(cuerpo,1,60) AS cuerpo, substr(metadata_json,1,120) AS meta FROM eventos WHERE metadata_json LIKE '%unknown_%' ORDER BY id DESC LIMIT 30;"

echo
echo "=== usuarios actuales ==="
sqlite3 -header -column "$DB" "SELECT id, nombre, rol, wa_cus, wa_lid, email, calendar_id, activo, creado FROM usuarios ORDER BY id;"

echo
echo "=== últimos 80 logs pm2 ==="
pm2 logs maria --lines 80 --nostream 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -80
