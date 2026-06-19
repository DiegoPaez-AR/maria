#!/bin/bash
set +e
DB=/root/secretaria/state/maria-paez/db/maria.sqlite
echo "total contactos:        $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos;")"
echo "con email:              $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE email IS NOT NULL AND email != '';")"
echo "email corporativo:      $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE email IS NOT NULL AND email NOT LIKE '%@gmail.com' AND email NOT LIKE '%@hotmail%' AND email NOT LIKE '%@outlook%' AND email NOT LIKE '%@yahoo%' AND email NOT LIKE '%@icloud.com' AND email NOT LIKE '%@live.com' AND email != '';")"
echo "email gmail/personal:   $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE email LIKE '%@gmail.com' OR email LIKE '%@hotmail%' OR email LIKE '%@outlook%' OR email LIKE '%@yahoo%' OR email LIKE '%@icloud.com' OR email LIKE '%@live.com';")"
echo "ya tienen perfil_web:   $(sqlite3 "$DB" "SELECT COUNT(*) FROM contactos WHERE perfil_web IS NOT NULL;")"
