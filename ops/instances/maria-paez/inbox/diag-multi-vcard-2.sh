#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Eventos cuyo cuerpo contiene varios BEGIN:VCARD (multi-vcard pasados de largo) ═══"
sqlite3 -header "$DB" "
SELECT datetime(timestamp), tipo_original, substr(de,1,30) AS de,
       (LENGTH(cuerpo) - LENGTH(REPLACE(cuerpo, 'BEGIN:VCARD', ''))) / LENGTH('BEGIN:VCARD') AS n_vcards,
       substr(cuerpo, 1, 200) AS cuerpo_inicio
FROM eventos
WHERE canal='whatsapp' AND timestamp >= datetime('now','-30 days')
  AND cuerpo LIKE '%BEGIN:VCARD%'
ORDER BY timestamp DESC LIMIT 30;
"

echo ""
echo "═══ Sample de cuerpo de un mensaje vCard reciente (para ver shape real) ═══"
sqlite3 "$DB" "SELECT cuerpo FROM eventos WHERE canal='whatsapp' AND cuerpo LIKE '%BEGIN:VCARD%' AND timestamp >= datetime('now','-2 days') ORDER BY timestamp DESC LIMIT 1;" | head -50

echo ""
echo "═══ pm2 logs — handler de mensaje (qué dice el log de cada msg entrante) ═══"
pm2 logs maria-paez --lines 3000 --nostream 2>&1 | grep -iE "vcard|tipo:" | tail -40
