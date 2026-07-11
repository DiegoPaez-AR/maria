#!/bin/bash
set -e
DB="${MARIA_DB:?falta MARIA_DB}"
Q() { sqlite3 "$DB" "$1"; }
echo "== salientes WA junio (total) =="
Q "SELECT COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp >= '2026-06-01' AND timestamp < '2026-07-01';"
echo "== de esos, DENTRO de ventana 24h (hubo entrante del mismo wid en las 24h previas) =="
Q "SELECT COUNT(*) FROM eventos s WHERE s.canal='whatsapp' AND s.direccion='saliente' AND s.timestamp >= '2026-06-01' AND s.timestamp < '2026-07-01' AND EXISTS (SELECT 1 FROM eventos e WHERE e.canal='whatsapp' AND e.direccion='entrante' AND e.de = s.de AND e.timestamp <= s.timestamp AND e.timestamp > datetime(s.timestamp,'-24 hours'));"
echo "== entrantes WA junio =="
Q "SELECT COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND timestamp >= '2026-06-01' AND timestamp < '2026-07-01';"
echo "== salientes por tipo (metadata.tipo / tipo col) top 12 =="
Q "SELECT COALESCE(tipo,'(sin tipo)') t, COUNT(*) FROM eventos WHERE canal='whatsapp' AND direccion='saliente' AND timestamp >= '2026-06-01' AND timestamp < '2026-07-01' GROUP BY t ORDER BY 2 DESC LIMIT 12;"
echo "== destinos distintos con saliente fuera de ventana =="
Q "SELECT COUNT(DISTINCT s.de) FROM eventos s WHERE s.canal='whatsapp' AND s.direccion='saliente' AND s.timestamp >= '2026-06-01' AND s.timestamp < '2026-07-01' AND NOT EXISTS (SELECT 1 FROM eventos e WHERE e.canal='whatsapp' AND e.direccion='entrante' AND e.de = s.de AND e.timestamp <= s.timestamp AND e.timestamp > datetime(s.timestamp,'-24 hours'));"
echo "== salientes fuera de ventana por día (promedio) =="
Q "SELECT ROUND(COUNT(*)/30.0,1) FROM eventos s WHERE s.canal='whatsapp' AND s.direccion='saliente' AND s.timestamp >= '2026-06-01' AND s.timestamp < '2026-07-01' AND NOT EXISTS (SELECT 1 FROM eventos e WHERE e.canal='whatsapp' AND e.direccion='entrante' AND e.de = s.de AND e.timestamp <= s.timestamp AND e.timestamp > datetime(s.timestamp,'-24 hours'));"
