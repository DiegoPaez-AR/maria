#!/bin/bash
# Borra los mensajes SALIENTES de Maria dirigidos a la "María" fantasma en el
# bucket de Hernan (user 2). Estos mensajes (errores de hoy) contaminan el
# historial y Maria los re-replica. Los inbound legitimos de Hernan saludando
# "Hola María" NO se tocan (direccion='entrante').
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf; set -a; . "$cf"; set +a
DB="$MARIA_DB"
W="usuario_id=2 AND direccion='saliente' AND (cuerpo LIKE 'Hola Mar_a!%' OR cuerpo LIKE 'Le confirmo a Mar_a %' OR cuerpo LIKE 'Listo, le confirmo a Mar_a %')"

echo "=== ANTES — filas que voy a borrar ==="
sqlite3 -header -column "$DB" "SELECT id, datetime(timestamp,'-3 hours') art, substr(cuerpo,1,70) FROM eventos WHERE $W ORDER BY id;"
N=$(sqlite3 "$DB" "SELECT COUNT(*) FROM eventos WHERE $W;")
echo "total a borrar: $N"

sqlite3 "$DB" "DELETE FROM eventos WHERE $W;"

echo ""
echo "=== DESPUES — quedan salientes a 'María'? (deberia 0) ==="
sqlite3 "$DB" "SELECT COUNT(*) AS quedan FROM eventos WHERE $W;"
echo ""
echo "=== sanity: ultimos mensajes del hilo Hernan (debe quedar coherente) ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, direccion, substr(cuerpo,1,55) FROM eventos WHERE usuario_id=2 AND canal='whatsapp' ORDER BY id DESC LIMIT 6;"
