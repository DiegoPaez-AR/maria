#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

# Eventos: `de` es la CONTRAPARTE (no el remitente literal).
# Para entrante: de = wa de quien escribió. Para saliente: de = wa del destinatario.
# Diego: wa_cus 541132317896 (sin 9) o 5491132317896 (con 9); wa_lid 34342575317160.

echo "═══════════════════════════════════════════════════════════════"
echo "  CONVERSACIÓN DIEGO — hoy desde 00:00 ART (UTC ≥ 03:00)        "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 "$DB" <<SQL
.mode list
.headers off
.separator " | "
SELECT
  printf('%-5d', id) || ' ' ||
  timestamp || ' ' ||
  CASE direccion WHEN 'entrante' THEN '◀ DIEGO  ' WHEN 'saliente' THEN '▶ MARIA  ' ELSE printf('%-9s',direccion) END || '  ' ||
  REPLACE(REPLACE(SUBSTR(COALESCE(cuerpo,''), 1, 320), char(10), ' ↵ '), char(13), '')
FROM eventos
WHERE timestamp >= '2026-05-19 03:00:00'
  AND canal = 'whatsapp'
  AND de IN ('5491132317896@c.us', '541132317896@c.us', '34342575317160@lid')
ORDER BY id ASC;
SQL

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Acciones del sistema en esa misma ventana (hoy)               "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 "$DB" <<SQL
.mode list
.headers off
.separator ' '
SELECT
  printf('%-5d', id) || ' ' || timestamp || ' ' ||
  REPLACE(SUBSTR(COALESCE(cuerpo,''), 1, 220), char(10), ' ↵ ')
FROM eventos
WHERE timestamp >= '2026-05-19 03:00:00'
  AND canal = 'sistema'
ORDER BY id ASC;
SQL
