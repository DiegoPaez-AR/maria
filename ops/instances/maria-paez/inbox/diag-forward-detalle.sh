#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Metadata de los eventos con adjuntos del 16-may 22:14-22:30 ═══"
sqlite3 -header "$DB" "SELECT id, datetime(timestamp), tipo_original, substr(cuerpo,1,80) AS cuerpo, metadata FROM eventos WHERE canal='whatsapp' AND timestamp >= '2026-05-16 22:14' AND timestamp <= '2026-05-16 22:35' AND direccion='entrante' ORDER BY timestamp ASC LIMIT 30;"

echo ""
echo "═══ Acciones ejecutadas / falladas entre 22:14 y 22:35 ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), substr(cuerpo,1,200) AS msg FROM eventos WHERE canal='sistema' AND timestamp >= '2026-05-16 22:14' AND timestamp <= '2026-05-16 22:35' AND (cuerpo LIKE '%acción%' OR cuerpo LIKE '%reenviar%' OR cuerpo LIKE '%forward%') ORDER BY timestamp ASC;"

echo ""
echo "═══ pm2 logs filtrados — ese rango horario, reenviar/forward ═══"
pm2 logs maria-paez --lines 12000 --nostream 2>&1 | grep -E "2026-05-16 22:(1[4-9]|2[0-9]|3[0-5])" | grep -iE "reenviar|forward|attach|esMedia|fotos|getMessageById|hasMedia" | head -40
