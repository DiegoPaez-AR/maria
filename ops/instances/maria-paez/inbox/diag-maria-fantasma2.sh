#!/bin/bash
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf; set -a; . "$cf"; set +a
DB="$MARIA_DB"

echo "=== metadata del evento 'Hola María!' (a donde fue?) ==="
sqlite3 "$DB" "SELECT id, datetime(timestamp,'-3 hours') art, usuario_id, direccion, de, nombre, metadata_json FROM eventos WHERE cuerpo LIKE 'Hola Mar_a! Hern%' ORDER BY id DESC LIMIT 3;"

echo ""
echo "=== RE-AUDITORIA: cualquier contacto/usuario 'Maria' o numero 79043441 ==="
echo "-- usuarios --"
sqlite3 -header -column "$DB" "SELECT id,nombre,wa_cus,email FROM usuarios WHERE nombre LIKE '%Mar_a%' OR wa_cus LIKE '%79043441%';"
echo "-- contactos (todas las libretas) --"
sqlite3 -header -column "$DB" "SELECT id,usuario_id,nombre,whatsapp,visibilidad FROM contactos WHERE nombre LIKE '%Mar_a P%' OR nombre LIKE '%secretaria%' OR nombre LIKE '%sec. Diego%' OR whatsapp LIKE '%79043441%';"

echo ""
echo "=== cuantas veces aparece 'Hola María' o 'le confirmo a María' en el historial de Hernan (contaminacion) ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, substr(cuerpo,1,80) FROM eventos WHERE usuario_id=2 AND (cuerpo LIKE '%Hola Mar_a%' OR cuerpo LIKE '%confirmo a Mar_a%' OR cuerpo LIKE '%a Mar_a el%' OR cuerpo LIKE '%María%') ORDER BY timestamp;"

echo ""
echo "=== evento creado 15:46 (crear_evento) — que quedo? ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, substr(cuerpo,1,120) FROM eventos WHERE usuario_id=2 AND canal='calendar' AND timestamp >= '2026-05-29 18:00:00' ORDER BY timestamp DESC LIMIT 5;"
