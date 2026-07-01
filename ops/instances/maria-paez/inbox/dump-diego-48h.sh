#!/bin/bash
set -a; [ -f "$MARIA_CONF" ] && . "$MARIA_CONF"; set +a
DB="${MARIA_DB:?}"
OUT_DIR="$(dirname "$0")/../outbox"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/dump-diego-48h.out"
{
echo "=== OWNER ==="
sqlite3 -header -column "$DB" "SELECT id,nombre,wa_lid,wa_cus,rol,servido,tz FROM usuarios WHERE rol='owner';"
echo
OID=$(sqlite3 "$DB" "SELECT id FROM usuarios WHERE rol='owner' LIMIT 1;")
echo "OWNER_ID=$OID"
echo
echo "=== EVENTOS ULTIMAS 48h (owner WA + sistema/interno) ==="
sqlite3 "$DB" <<SQL
.mode list
.separator " | "
SELECT id, datetime(timestamp,'localtime') AS ts, canal, direccion, de, substr(replace(replace(cuerpo,char(10),' / '),char(13),''),1,600) AS cuerpo
FROM eventos
WHERE timestamp >= datetime('now','-48 hours')
  AND (
    usuario_id = $OID
    OR de IN (SELECT wa_lid FROM usuarios WHERE id=$OID)
    OR de IN (SELECT wa_cus FROM usuarios WHERE id=$OID)
    OR (canal='sistema' AND direccion='interno')
  )
ORDER BY id ASC;
SQL
} > "$OUT" 2>&1
echo "done $(date)" >> "$OUT"
