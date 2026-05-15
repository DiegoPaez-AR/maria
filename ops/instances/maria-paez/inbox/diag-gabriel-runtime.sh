#!/bin/bash
# Extraer el prompt enviado a Claude y la acción emitida durante la conversación con Gabriel.
set +e
DB=/root/secretaria/state/maria-paez/db/maria.sqlite

echo "═══ 1) ¿Existe audit log de prompts/respuestas de Claude? ═══"
ls /root/secretaria/state/maria-paez/ | grep -iE 'audit|prompt|claude' 2>&1
find /root/secretaria/state/maria-paez -maxdepth 3 -name '*.jsonl' -o -name '*audit*' -o -name '*claude*' 2>/dev/null | head -10
echo ""
echo "Tablas en la DB:"
sqlite3 "$DB" ".tables"
echo ""
echo "Si hay tabla 'claude_audit' o similar, schema:"
sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%audit%'"

echo ""
echo "═══ 2) Eventos sistema 'claude_call' o 'acción ejecutada' alrededor del bug ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, substr(cuerpo,1,200) AS cuerpo
FROM eventos
WHERE canal='sistema'
  AND (cuerpo LIKE '%claude_call%' OR cuerpo LIKE '%acción ejecutada%' OR cuerpo LIKE '%razonamiento%' OR cuerpo LIKE '%enviar_wa%' OR cuerpo LIKE '%upsert_contacto%')
  AND timestamp >= '2026-05-15 13:33' AND timestamp <= '2026-05-15 13:42'
ORDER BY id ASC
LIMIT 40
"

echo ""
echo "═══ 3) TODO el evento intern '*' (canal sistema) en la ventana — sin filtro ═══"
sqlite3 -header -column "$DB" "
SELECT id, timestamp, substr(cuerpo,1,180) AS cuerpo
FROM eventos
WHERE canal='sistema' AND direccion='interno'
  AND timestamp >= '2026-05-15 13:33' AND timestamp <= '2026-05-15 13:42'
ORDER BY id ASC
LIMIT 80
"

echo ""
echo "═══ 4) ¿claude-client.js tiene audit/log con prompts completos? ═══"
grep -nE 'audit|fs\.writeFileSync|fs\.appendFileSync|jsonl' /root/secretaria/claude-client.js | head -20
echo ""
echo "Archivos en /tmp con audit reciente:"
ls -la /tmp/maria-* 2>/dev/null | tail -10
echo "/var/log/?"
ls -la /var/log/maria* 2>/dev/null

echo ""
echo "═══ 5) Buscar archivos jsonl/audit en el VPS (cualquiera) ═══"
find /root/secretaria -type f \( -name '*.jsonl' -o -name '*audit*.log' \) 2>/dev/null | grep -v node_modules | head -10
