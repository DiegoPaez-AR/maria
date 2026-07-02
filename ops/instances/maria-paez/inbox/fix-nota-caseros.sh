#!/bin/bash
DB="$MARIA_DB"
sqlite3 "$DB" "UPDATE contactos SET notas = 'Número confirmado: atendieron y tomaron un pedido el 01/07/2026 (se identifican como Barra Chalaca San Telmo, Av. Caseros 467). Pago al retirar.', actualizado = CURRENT_TIMESTAMP WHERE id = 352 AND whatsapp = '5491169594900@c.us';" 2>&1
echo "rows changed: $(sqlite3 "$DB" 'SELECT changes();' 2>/dev/null)"
sqlite3 -readonly "$DB" -line "SELECT id, nombre, whatsapp, notas, actualizado FROM contactos WHERE id = 352;" 2>&1
