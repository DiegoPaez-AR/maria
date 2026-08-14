#!/bin/bash
DB="${MARIA_DB:?falta MARIA_DB}"
sqlite3 "$DB" "SELECT id, estado, intentos, COALESCE(tomado_en,'-'), COALESCE(entregado,'-'), substr(texto,1,28) FROM wa_outbox ORDER BY id DESC LIMIT 4;"
