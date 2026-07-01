#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/borrar-evento-test2.out"
PORT="${ASISTENTE_INTERNAL_PORT:?}"; SECRET="${ASISTENTE_INTERNAL_SECRET:?}"
{
echo "=== borrar_evento up8hrfda1r63glv9itn05garcc (cal diego@paez.is) ==="
curl -s -m 25 -X POST "http://127.0.0.1:$PORT/accion" -H "X-Intensa-Secret: $SECRET" -H "Content-Type: application/json" \
 -d '{"usuarioId":1,"accion":{"tipo":"borrar_evento","id":"up8hrfda1r63glv9itn05garcc","calendarId":"diego@paez.is"}}'; echo
} > "$OUT" 2>&1
echo done >> "$OUT"
