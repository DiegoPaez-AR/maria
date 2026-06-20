#!/bin/bash
set +e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "=== liveness: ultimo evento + count hoy ==="
sqlite3 "$DB" "SELECT max(timestamp) FROM eventos;" 2>&1
sqlite3 "$DB" "SELECT count(*) FROM eventos WHERE timestamp >= '2026-06-20';" 2>&1
echo; echo "=== schema eventos (nombres de columnas) ==="
sqlite3 "$DB" ".schema eventos" 2>&1 | head -25
echo; echo "=== TODOS los eventos sistema/interno del 06-20 con FALL o desconocido ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||cuerpo FROM eventos WHERE timestamp >= '2026-06-20' AND (cuerpo LIKE '%FALL%' OR cuerpo LIKE '%descono%' OR cuerpo LIKE '%enviar_wa%' OR cuerpo LIKE '%ejecutada%') ORDER BY timestamp;" 2>&1 | head -60
echo; echo "=== acciones ejecutadas/fallidas 06-20 alrededor de 10:35-10:45 y 13:20-13:30 (todo el cuerpo) ==="
sqlite3 -cmd ".mode list" "$DB" "SELECT substr(timestamp,1,16)||' | '||canal||'/'||direccion||' | '||substr(cuerpo,1,160) FROM eventos WHERE (timestamp BETWEEN '2026-06-20 10:35' AND '2026-06-20 10:46') OR (timestamp BETWEEN '2026-06-20 13:20' AND '2026-06-20 13:30') ORDER BY timestamp;" 2>&1 | head -80
