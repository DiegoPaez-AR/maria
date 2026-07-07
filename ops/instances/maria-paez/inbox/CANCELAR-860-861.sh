#!/bin/bash
set -e
DB="${MARIA_DB:?falta MARIA_DB}"
sqlite3 "$DB" "UPDATE programados SET enviado=1, metadata_json=json_set(COALESCE(metadata_json,'{}'),'\$.cancelado','vencido durante bloqueo WA 2026-07-07') WHERE enviado=0 AND id IN (860,861);"
echo "quedan pendientes:"
sqlite3 "$DB" "SELECT id, cuando, substr(texto,1,40) FROM programados WHERE enviado=0;"
