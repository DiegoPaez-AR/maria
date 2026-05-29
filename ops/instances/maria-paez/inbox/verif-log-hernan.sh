#!/bin/bash
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf; set -a; . "$cf"; set +a
echo "=== ultimas salientes a Hernan (usuario_id=2) ==="
sqlite3 -header -column "$MARIA_DB" "SELECT datetime(timestamp,'-3 hours') art, direccion, de, COALESCE(json_extract(metadata_json,'\$.tipo'),'') tipo, substr(cuerpo,1,55) FROM eventos WHERE usuario_id=2 AND canal='whatsapp' ORDER BY id DESC LIMIT 4;"
