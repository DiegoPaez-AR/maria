#!/bin/bash
DB="${MARIA_DB:?}"
sqlite3 "$DB" "SELECT id, estado, intentos, COALESCE(tomado_en,'-'), COALESCE(entregado,'-') FROM wa_outbox ORDER BY id DESC LIMIT 3;"
