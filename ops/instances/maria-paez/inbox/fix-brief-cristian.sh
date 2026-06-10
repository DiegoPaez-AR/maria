#!/bin/bash
# inbox: cumple la promesa de Maria del 02/06 — brief de Cristian Ruiz (id=9)
# a las 09:15, y cierra el pendiente 117. Usa internal-api para que el proceso
# vivo actualice su cache de usuarios.
set -u
PORT="${ASISTENTE_INTERNAL_PORT:-4501}"
echo "== update brief_hora/minuto via internal-api =="
curl -s -m 10 -X POST "http://127.0.0.1:${PORT}/update-usuario" \
  -H "x-intensa-secret: ${ASISTENTE_INTERNAL_SECRET:-}" \
  -H 'Content-Type: application/json' \
  -d '{"id":9,"brief_hora":"09","brief_minuto":"15"}'
echo ""
echo "== cerrar pendiente 117 =="
python3 - "${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}" <<'PYEOF'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute("UPDATE pendientes SET estado='cerrado', cerrado=CURRENT_TIMESTAMP WHERE id=117 AND estado='abierto'")
db.commit()
row = db.execute("SELECT id, estado, cerrado FROM pendientes WHERE id=117").fetchone()
print("pendiente 117:", row)
row = db.execute("SELECT id, nombre, brief_hora, brief_minuto FROM usuarios WHERE id=9").fetchone()
print("usuario 9:", row)
PYEOF
