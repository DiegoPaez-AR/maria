#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/limpiar-evento-test.out"
DB="${MARIA_DB:?}"
{
echo "=== metadata del evento creado (buscar google id) ==="
sqlite3 "$DB" "SELECT metadata_json FROM eventos WHERE id=12945;" | head -c 600; echo
GID=$(sqlite3 "$DB" "SELECT json_extract(metadata_json,'\$.resultado.id') FROM eventos WHERE id=12945;")
[ -z "$GID" ] && GID=$(sqlite3 "$DB" "SELECT json_extract(metadata_json,'\$.resultado.eventId') FROM eventos WHERE id=12945;")
echo "GID=$GID"
PORT="${ASISTENTE_INTERNAL_PORT:?}"; SECRET="${ASISTENTE_INTERNAL_SECRET:?}"
if [ -n "$GID" ] && [ "$GID" != "null" ]; then
  echo "=== borrar via /accion borrar_evento ==="
  curl -s -m 20 -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" -d "{\"usuarioId\":1,\"accion\":{\"tipo\":\"borrar_evento\",\"id\":\"$GID\"}}"; echo
else
  echo "no encontré google id en metadata — dump completo:"; sqlite3 "$DB" "SELECT metadata_json FROM eventos WHERE id=12945;"
fi
} > "$OUT" 2>&1
echo done >> "$OUT"
