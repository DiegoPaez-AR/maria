#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Conversación de Diego con Maria últimas 36h (entrantes y salientes) ═══"
sqlite3 -header "$DB" "SELECT datetime(timestamp), direccion, substr(cuerpo,1,250) AS msg FROM eventos WHERE canal='whatsapp' AND timestamp >= datetime('now','-36 hours') AND (de LIKE '%5491132317896%' OR de LIKE '%34342575317160%' OR direccion='saliente') AND direccion IN ('entrante','saliente') ORDER BY timestamp ASC LIMIT 200;"
