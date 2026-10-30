#!/bin/bash
cd /root/secretaria
( set -a; . config/instances/maria-paez.conf; set +a; sqlite3 "$MARIA_DB" "SELECT id, estado, intentos, datetime(entregado,'-3 hours'), substr(metadata_json,1,400) FROM wa_outbox WHERE id=309;" )
grep -E "#309|frio\] verificaci" logs/maria-paez/out.log | tail -8 | cut -c1-250
