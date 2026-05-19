#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"

echo "═══ Programados pendientes para los próximos 2 días ═══"
sqlite3 -header -column "$DB" <<'SQL'
SELECT
  id,
  cuando,
  canal,
  destino,
  enviado,
  substr(texto,1,90) AS texto,
  COALESCE(razon,'') AS razon,
  creado
FROM programados
WHERE enviado = 0
  AND cuando >= '2026-05-19T00:00:00'
  AND cuando <  '2026-05-21T00:00:00'
ORDER BY cuando ASC;
SQL

echo ""
echo "═══ Programados con destinos sospechosos (números Teubal viejos/nuevos) ═══"
sqlite3 -header -column "$DB" <<'SQL'
SELECT id, cuando, destino, enviado, substr(texto,1,80) AS texto, creado
FROM programados
WHERE (destino LIKE '%43092046%' OR destino LIKE '%4491280%')
ORDER BY id DESC LIMIT 30;
SQL

echo ""
echo "═══ Auditar 'enviado' y estado real ═══"
sqlite3 -header -column "$DB" "SELECT enviado, COUNT(*) FROM programados WHERE cuando >= '2026-05-19' AND cuando < '2026-05-21' GROUP BY enviado;"
