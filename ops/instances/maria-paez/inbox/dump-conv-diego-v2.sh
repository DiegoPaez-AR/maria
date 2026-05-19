#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

# Verificar esquema primero
echo "═══ COLUMNAS de eventos ═══"
sqlite3 "$DB" "PRAGMA table_info(eventos);"
echo ""

DIEGO_CUS="5491132317896@c.us"
DIEGO_LID="34342575317160@lid"

echo "═══════════════════════════════════════════════════════════════"
echo "  CONVERSACIÓN DIEGO (cus + lid) desde 00:00 ART hoy            "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 -separator '|' "$DB" <<SQL
.mode list
.headers off
SELECT
  id,
  timestamp,
  CASE
    WHEN direccion='entrante' THEN '◀ DIEGO  '
    WHEN direccion='saliente' THEN '▶ MARIA  '
    ELSE direccion
  END,
  REPLACE(REPLACE(SUBSTR(COALESCE(cuerpo,''), 1, 280), char(10), ' ↵ '), char(13), '')
FROM eventos
WHERE timestamp >= '2026-05-19 03:00:00'
  AND canal = 'whatsapp'
  AND (de = '$DIEGO_CUS' OR de = '$DIEGO_LID' OR para = '$DIEGO_CUS' OR para = '$DIEGO_LID')
ORDER BY id ASC;
SQL

echo ""
echo "═══ Identidades de Diego (usuarios.id, wa_cus, lid alternates) ═══"
sqlite3 -header -column "$DB" "SELECT id, nombre, wa_cus, wa_lid FROM usuarios WHERE nombre LIKE '%Diego%' OR wa_cus = '5491132317896@c.us' OR wa_cus LIKE '%32317896%' LIMIT 5;"

echo ""
echo "═══ AYER — claude_calls largas (>60s) — entender carga real ═══"
sqlite3 -separator '|' "$DB" <<SQL
.mode list
.headers off
SELECT id, timestamp, substr(cuerpo, 1, 180)
FROM eventos
WHERE canal='sistema'
  AND timestamp >= '2026-05-18 03:00:00'
  AND timestamp <  '2026-05-19 03:00:00'
  AND cuerpo LIKE 'claude_call%'
  AND CAST(SUBSTR(cuerpo, INSTR(cuerpo,':')+2, INSTR(cuerpo,'ms')-INSTR(cuerpo,':')-2) AS INT) > 60000
ORDER BY id ASC;
SQL
