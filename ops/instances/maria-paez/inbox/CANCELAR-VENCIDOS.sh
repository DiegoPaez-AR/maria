#!/bin/bash
# Cancelar recordatorios "En 15min" ya vencidos antes del re-scan del QR
# (la ráfaga post-reconexión probablemente mató la sesión nueva).
set -e
DB="${MARIA_DB:?falta MARIA_DB}"
echo "== vencidos pendientes =="
sqlite3 "$DB" "SELECT id, cuando, substr(texto,1,50) FROM programados WHERE enviado=0 AND cuando <= datetime('now');"
sqlite3 "$DB" "UPDATE programados SET enviado=1, metadata_json=json_set(COALESCE(metadata_json,'{}'),'\$.cancelado','vencido durante bloqueo WA 2026-07-07') WHERE enviado=0 AND cuando <= datetime('now');"
echo "== cancelados: $(sqlite3 "$DB" "SELECT changes();") =="
echo "== quedan pendientes =="
sqlite3 "$DB" "SELECT id, cuando, substr(texto,1,50) FROM programados WHERE enviado=0;"
