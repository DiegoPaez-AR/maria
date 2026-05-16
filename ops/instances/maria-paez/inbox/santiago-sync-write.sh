#!/bin/bash
set +e
set -a; . /root/secretaria/config/instances/maria-paez.conf; set +a

sqlite3 "$MARIA_DB" "UPDATE usuarios SET calendar_acceso='write', actualizado=CURRENT_TIMESTAMP WHERE id=5"
sqlite3 "$MARIA_DB" "INSERT INTO eventos (timestamp, usuario_id, canal, direccion, cuerpo) VALUES (CURRENT_TIMESTAMP, 5, 'sistema', 'interno', 'calendar_acceso autodetectado: none → write (post re-share Santiago)')"

echo "Estado final Santiago:"
sqlite3 -header -column "$MARIA_DB" "SELECT id, nombre, calendar_id, calendar_acceso FROM usuarios WHERE id=5"
