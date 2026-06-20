#!/bin/bash
set +e
DB="${MARIA_DB:-/root/secretaria/state/maria-paez/db/maria.sqlite}"
echo "DB=$DB"; ls -la "$DB" 2>&1
echo; echo "=== schema contactos ==="; sqlite3 "$DB" ".schema contactos" 2>&1 | head -30
echo; echo "=== enviar_wa FALLÓ (cuerpo) ==="
sqlite3 "$DB" "SELECT substr(timestamp,1,16), cuerpo FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'acci%n FALL%: enviar_wa%' ORDER BY timestamp DESC LIMIT 8;" 2>&1
echo; echo "=== metadata (accion+error) de esos fallos ==="
sqlite3 "$DB" "SELECT substr(timestamp,1,16), metadata FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'acci%n FALL%: enviar_wa%' ORDER BY timestamp DESC LIMIT 5;" 2>&1
echo; echo "=== contacto Alfonso/Amat guardado ==="
sqlite3 "$DB" "SELECT id, nombre, whatsapp, visibilidad, usuario_id FROM contactos WHERE nombre LIKE '%Alfonso%' OR nombre LIKE '%Amat%';" 2>&1
echo; echo "=== SEC_DESTINATARIO_STRICT ==="
grep -i SEC_DESTINATARIO_STRICT /root/secretaria/config/instances/maria-paez.conf 2>/dev/null || echo '(no seteado -> strict ON por default)'
