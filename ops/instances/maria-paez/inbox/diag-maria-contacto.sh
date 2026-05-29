#!/bin/bash
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf
set -a; . "$cf"; set +a
DB="$MARIA_DB"

echo "=== estado de calendar de Hernan (user 2) ==="
sqlite3 -header -column "$DB" "SELECT id,nombre,email,calendar_id,calendar_provider,calendar_acceso FROM usuarios WHERE id=2;" 2>&1

echo ""
echo "=== TODOS los contactos que sean 'Maria'/'María'/self de la asistente (posible polucion) ==="
sqlite3 -header -column "$DB" "SELECT id,usuario_id,nombre,whatsapp,visibilidad FROM contactos WHERE nombre LIKE '%Mar_a P%' OR nombre LIKE '%sec. Diego%' OR whatsapp LIKE '%79043441%' OR nombre LIKE '%secretaria%';" 2>&1

echo ""
echo "=== que le pidio Diego esta mañana (su chat, hora ART) ==="
sqlite3 "$DB" "
SELECT datetime(timestamp,'-3 hours') art, direccion,
       replace(substr(COALESCE(cuerpo,''),1,150),char(10),' / ') texto
FROM eventos
WHERE canal='whatsapp' AND usuario_id=1 AND timestamp >= '2026-05-29 11:00:00'
ORDER BY timestamp LIMIT 30;
" 2>&1

echo ""
echo "=== contexto: mensajes del chat de Hernan hoy MAÑANA temprano (antes de 9:50) ==="
sqlite3 "$DB" "
SELECT datetime(timestamp,'-3 hours') art, direccion, COALESCE(nombre,'') q,
       replace(substr(COALESCE(cuerpo,''),1,160),char(10),' / ') texto
FROM eventos
WHERE canal='whatsapp' AND de LIKE '%26829596%' AND timestamp >= '2026-05-29 11:30:00' AND timestamp < '2026-05-29 13:00:00'
ORDER BY timestamp LIMIT 20;
" 2>&1
