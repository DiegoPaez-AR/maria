#!/bin/bash
OUT_DIR="$(dirname "$0")/../outbox"; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/audit-libreta-diego.out"
DB="${MARIA_DB:?}"
{
echo "=== total contactos por usuario ==="
sqlite3 -column -header "$DB" "SELECT usuario_id, COUNT(*) n, SUM(CASE WHEN whatsapp IS NOT NULL AND whatsapp<>'' THEN 1 ELSE 0 END) con_wa FROM contactos GROUP BY usuario_id ORDER BY usuario_id;"
echo
echo "=== ultimos 15 contactos de Diego (uid=1) ==="
sqlite3 -column -header "$DB" "SELECT id, substr(nombre,1,22) nombre, whatsapp, substr(email,1,22) email, datetime(creado,'localtime') creado FROM contactos WHERE usuario_id=1 ORDER BY id DESC LIMIT 15;"
echo
echo "=== eventos 'contacto vcard' registrados (todos los usuarios), ultimos 15 ==="
sqlite3 -column "$DB" "SELECT id, datetime(timestamp,'localtime') ts, usuario_id, substr(cuerpo,1,70) FROM eventos WHERE cuerpo LIKE 'contacto vcard%' OR cuerpo LIKE '%vcard (privado)%' OR cuerpo LIKE '%multi_vcard%' ORDER BY id DESC LIMIT 15;"
echo
echo "=== eventos entrantes de tipo vcard/multi_vcard (tipo_original) ultimos 15 ==="
sqlite3 -column "$DB" "SELECT id, datetime(timestamp,'localtime') ts, usuario_id, tipo_original, substr(de,1,18) de FROM eventos WHERE tipo_original IN ('vcard','multi_vcard') ORDER BY id DESC LIMIT 15;"
echo
echo "=== esta Gabi (o su numero) en la libreta de alguien? ==="
sqlite3 -column -header "$DB" "SELECT id,usuario_id,nombre,whatsapp FROM contactos WHERE whatsapp LIKE '%116528%' OR whatsapp LIKE '%5286555%' OR nombre LIKE '%chaniz%';"
} > "$OUT" 2>&1
echo done >> "$OUT"
