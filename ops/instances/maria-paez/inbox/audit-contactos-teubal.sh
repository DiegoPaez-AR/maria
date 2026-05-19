#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "═══ 1. Contactos de Teubal (TODOS) ═══"
sqlite3 -header -column "$DB" <<'SQL'
SELECT id, usuario_id, nombre, whatsapp, email, notas, visibilidad, creado, actualizado
FROM contactos
WHERE nombre LIKE '%Teubal%' OR whatsapp LIKE '%4491280%' OR whatsapp LIKE '%43092046%'
ORDER BY id ASC;
SQL

echo ""
echo "═══ 2. Cuántas filas Teubal? ═══"
sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE nombre LIKE '%Teubal%';"

echo ""
echo "═══ 3. Cómo Maria interpreta 'mañana' — buscar lógica de fechas ═══"
echo "--- fechas relativas en código ---"
grep -RIn "mañana\|tomorrow\|relativeDate\|interpretar.*fecha\|date.*relativa" /root/secretaria \
  --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=ops --exclude-dir=state \
  2>/dev/null | head -30

echo ""
echo "--- en prompt-builder, cómo se le explica al LLM la hora actual ---"
grep -n "ahora\|now\|fecha actual\|currentTime\|hora\b" /root/secretaria/prompt-builder.js 2>/dev/null | head -20

echo ""
echo "═══ 4. Post-acción: cómo se reporta un fallo al owner ═══"
echo "--- buscar 'FALLÓ' / 'falló' / handler de errores en executor ---"
grep -n "FALLÓ\|notif.*owner\|reportar.*fall\|aviso.*fall" /root/secretaria/executor.js 2>/dev/null | head -20

echo ""
echo "═══ 5. Cuando un enviar_wa programado dispara y falla — hay aviso al owner? ═══"
grep -RIn "programado.*fall\|scheduler.*err\|enviar_wa.*err" /root/secretaria \
  --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=ops --exclude-dir=state \
  2>/dev/null | head -15
