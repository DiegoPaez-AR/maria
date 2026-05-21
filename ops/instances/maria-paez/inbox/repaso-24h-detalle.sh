#!/bin/bash
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
OUT="/root/.pm2/logs/maria-paez-out.log"

echo "=== EVENTOS DE SEGURIDAD / INJECTION / RATE-LIMIT (24h) ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, canal, substr(COALESCE(cuerpo,''),1,160) cuerpo FROM eventos WHERE timestamp >= datetime('now','-24 hours') AND (cuerpo LIKE '%injection%' OR cuerpo LIKE '%rate_limit%' OR cuerpo LIKE '%seguridad%' OR cuerpo LIKE '%injecc%') ORDER BY id;"
echo
echo "=== eventos con 'AVISO' o 'fallo' en 24h ==="
sqlite3 -header -column "$DB" "SELECT id, timestamp, direccion, substr(COALESCE(cuerpo,''),1,180) cuerpo FROM eventos WHERE timestamp >= datetime('now','-24 hours') AND (cuerpo LIKE '%AVISO%' OR cuerpo LIKE '%fallo%') ORDER BY id;"
echo
echo "=== contexto log: AVISO fallos a Doris ==="
grep -n -B3 -A3 "AVISO fallos" "$OUT" | tail -20
echo
echo "=== Diego Teubal escribio en 24h? (busco su numero 144491280 y lid viejo) ==="
sqlite3 -header -column "$DB" "SELECT id,timestamp,canal,direccion,substr(COALESCE(de,para,''),1,24) wa,substr(COALESCE(cuerpo,''),1,90) cuerpo FROM eventos WHERE timestamp >= datetime('now','-24 hours') AND (de LIKE '%144491280%' OR para LIKE '%144491280%' OR de LIKE '%278606039236859%' OR para LIKE '%278606039236859%' OR cuerpo LIKE '%Teubal%') ORDER BY id;"
echo "(si vacio: Teubal no aparecio en la ventana de 24h)"
echo
echo "=== ultimos 12 eventos (pulso actual) ==="
sqlite3 -column "$DB" "SELECT timestamp, canal, direccion, substr(COALESCE(cuerpo,''),1,75) FROM eventos ORDER BY id DESC LIMIT 12;"
