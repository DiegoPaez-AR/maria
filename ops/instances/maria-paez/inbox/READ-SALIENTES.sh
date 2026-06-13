#!/bin/bash
set -a; cf=/root/secretaria/config/instances/maria-paez.conf; . "$cf"; set +a
DB="${MARIA_DB}"
echo "== WA salientes de Maria últimas 48h (hora | destinatario nombre | cuerpo) =="
sqlite3 -separator ' | ' "$DB" "
SELECT substr(timestamp,6,11),
  COALESCE(nombre, substr(de,1,18)),
  replace(substr(cuerpo,1,220),char(10),' ')
FROM eventos
WHERE canal='whatsapp' AND direccion='saliente'
  AND timestamp >= datetime('now','-48 hours')
  AND COALESCE(json_extract(metadata_json,'\$.tipo'),'') NOT IN ('unknown_flow_aviso')
ORDER BY timestamp DESC LIMIT 40;"
