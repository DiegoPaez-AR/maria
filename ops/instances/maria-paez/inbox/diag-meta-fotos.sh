#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Schema completo de eventos ═══"
sqlite3 "$DB" ".schema eventos"

echo ""
echo "═══ Fila completa de un evento entrante con fotos del 22:15 ═══"
sqlite3 "$DB" -cmd ".mode line" "SELECT * FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND timestamp >= '2026-05-16 22:15' AND timestamp <= '2026-05-16 22:16' AND cuerpo LIKE '%adjunt%' LIMIT 2;"

echo ""
echo "═══ Ver si hay columna meta/metadata/json ═══"
sqlite3 "$DB" "PRAGMA table_info(eventos);"
