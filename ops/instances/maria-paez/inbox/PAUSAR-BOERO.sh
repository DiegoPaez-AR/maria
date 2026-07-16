#!/bin/bash
set -e
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== antes =="
sqlite3 "$DB" "SELECT id, nombre, servido, activo, email, telegram_chat_id FROM usuarios WHERE nombre LIKE '%Boero%';"
sqlite3 "$DB" "UPDATE usuarios SET servido=0 WHERE nombre LIKE '%Boero%';"
echo "== después =="
sqlite3 "$DB" "SELECT id, nombre, servido, activo FROM usuarios WHERE nombre LIKE '%Boero%';"
cd /root/secretaria && pm2 reload ecosystem.config.js --only maria-paez --update-env >/dev/null 2>&1 && echo "reload OK (corta el retry en curso)"
