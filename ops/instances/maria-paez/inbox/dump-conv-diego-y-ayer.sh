#!/bin/bash
set -u
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "DB: $DB"
echo ""

# Timezone: AR es UTC-3, así que "00:00 ART de hoy 2026-05-19" = "2026-05-19 03:00:00 UTC"
# Ayer todo el día ART = 2026-05-18 03:00:00 UTC → 2026-05-19 03:00:00 UTC
DIEGO="5491132317896@c.us"

echo "═══════════════════════════════════════════════════════════════"
echo "  CONVERSACIÓN COMPLETA CON DIEGO desde 00:00 ART de hoy        "
echo "  (UTC >= 2026-05-19 03:00:00)                                  "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 -separator '|' "$DB" <<SQL
.mode list
.headers off
SELECT
  id,
  timestamp,
  CASE direccion WHEN 'entrante' THEN '◀ DIEGO' WHEN 'saliente' THEN '▶ MARIA' ELSE direccion END AS dir,
  COALESCE(cuerpo, '')
FROM eventos
WHERE timestamp >= '2026-05-19 03:00:00'
  AND canal = 'whatsapp'
  AND (de = '$DIEGO' OR para_json LIKE '%$DIEGO%')
ORDER BY id ASC;
SQL

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ACCIONES Y FALLOS RELACIONADOS (sistema/interno) hoy desde 0  "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 -separator '|' "$DB" <<SQL
.mode list
.headers off
SELECT id, timestamp, substr(cuerpo, 1, 220)
FROM eventos
WHERE timestamp >= '2026-05-19 03:00:00'
  AND canal = 'sistema'
  AND (cuerpo LIKE '%FALLÓ%' OR cuerpo LIKE '%error%' OR cuerpo LIKE '%enviar_wa%' OR cuerpo LIKE '%programar_mensaje%' OR cuerpo LIKE '%mandar_email%' OR cuerpo LIKE '%crear_evento%')
ORDER BY id ASC;
SQL

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  RESUMEN AYER (2026-05-18 ART): mensajes por usuario           "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 -header -column "$DB" <<SQL
SELECT
  COALESCE(u.nombre, e.de) AS quien,
  e.de AS wa,
  SUM(CASE WHEN e.direccion='entrante' THEN 1 ELSE 0 END) AS recibidos,
  SUM(CASE WHEN e.direccion='saliente' THEN 1 ELSE 0 END) AS enviados,
  MIN(e.timestamp) AS primero,
  MAX(e.timestamp) AS ultimo
FROM eventos e
LEFT JOIN usuarios u ON u.wa_cus = e.de OR e.de LIKE '%' || u.wa_cus
WHERE e.canal = 'whatsapp'
  AND e.timestamp >= '2026-05-18 03:00:00'
  AND e.timestamp <  '2026-05-19 03:00:00'
GROUP BY e.de
ORDER BY (recibidos + enviados) DESC;
SQL

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  AYER — fallos/errores del sistema (claude calls, acciones)    "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 -separator '|' "$DB" <<SQL
.mode list
.headers off
SELECT id, timestamp, substr(cuerpo, 1, 200)
FROM eventos
WHERE canal = 'sistema'
  AND timestamp >= '2026-05-18 03:00:00'
  AND timestamp <  '2026-05-19 03:00:00'
  AND (cuerpo LIKE '%FALLÓ%' OR cuerpo LIKE '%timeout%' OR cuerpo LIKE '%ReferenceError%' OR cuerpo LIKE '%TypeError%' OR cuerpo LIKE '%SIGKILL%' OR cuerpo LIKE '%error%')
ORDER BY id ASC
LIMIT 80;
SQL

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  AYER — acciones ejecutadas (counts)                           "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 -header -column "$DB" <<SQL
SELECT
  TRIM(SUBSTR(cuerpo, INSTR(cuerpo, 'acción ejecutada: ') + LENGTH('acción ejecutada: '))) AS accion,
  COUNT(*) AS veces
FROM eventos
WHERE canal = 'sistema'
  AND timestamp >= '2026-05-18 03:00:00'
  AND timestamp <  '2026-05-19 03:00:00'
  AND cuerpo LIKE 'acción ejecutada:%'
GROUP BY accion
ORDER BY veces DESC;
SQL

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  AYER — claude_call latencias (estadísticas)                   "
echo "═══════════════════════════════════════════════════════════════"
sqlite3 -header -column "$DB" <<SQL
SELECT
  COUNT(*) AS total_calls,
  ROUND(AVG(CAST(SUBSTR(cuerpo, INSTR(cuerpo,':')+2, INSTR(cuerpo,'ms')-INSTR(cuerpo,':')-2) AS INT)), 0) AS avg_ms,
  MAX(CAST(SUBSTR(cuerpo, INSTR(cuerpo,':')+2, INSTR(cuerpo,'ms')-INSTR(cuerpo,':')-2) AS INT)) AS max_ms
FROM eventos
WHERE canal = 'sistema'
  AND timestamp >= '2026-05-18 03:00:00'
  AND timestamp <  '2026-05-19 03:00:00'
  AND cuerpo LIKE 'claude_call%';
SQL
