#!/bin/bash
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
sqlite3 "$DB" "select count(*) from contactos where usuario_id=1"
sqlite3 -separator ' | ' "$DB" "select c.nombre, coalesce(c.whatsapp,''), coalesce(c.email,''), c.visibilidad, date(c.creado), substr(coalesce(c.notas,''),1,60) from contactos c where c.usuario_id=1 order by lower(c.nombre)"
echo LISTO
