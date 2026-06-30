#!/bin/bash
set +e
LOG=/root/.pm2/logs/intensa-api-out.log
echo "### Request lines en ventana >= 2026-06-23 (clasificadas) ###"
awk '$0 ~ /^2026-(06-2[3-9]|06-30)/' "$LOG" | grep -aE "→ [0-9]" 
echo
echo "### Conteo por endpoint en ventana ###"
awk '$0 ~ /^2026-(06-2[3-9]|06-30)/' "$LOG" | grep -aoE "(GET|POST) /[a-zA-Z/-]*" | sort | uniq -c | sort -rn
echo
echo "### subscription/checkout events recientes (id, tipo) ###"
DB=/root/secretaria/state/control/control.sqlite
sqlite3 -column "$DB" "SELECT id, event_name, substr(coalesce(recibido_en, creado_en, ''),1,19) ts FROM webhook_events ORDER BY id DESC LIMIT 12;" 2>&1
echo "### schema webhook_events (col de fecha) ###"
sqlite3 "$DB" "PRAGMA table_info(webhook_events);" 2>&1
echo "=== DONE ==="
