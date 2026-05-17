#!/bin/bash
set +e
echo "═══ pm2 logs últimas 800 — buscar [DIAG vcard] ═══"
pm2 logs maria-paez --lines 800 --nostream 2>&1 | grep -A 1 -E "DIAG vcard|jose|aboso|mariano|abramson" | tail -100

echo ""
echo "═══ Eventos canal=sistema 'contacto vcard' últimas 15 min ═══"
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), substr(cuerpo,1,200) AS msg FROM eventos WHERE canal='sistema' AND cuerpo LIKE '%contacto vcard%' AND timestamp >= datetime('now','-15 minutes') ORDER BY timestamp ASC;"

echo ""
echo "═══ Cualquier evento entrante en últimos 5 min ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), canal, direccion, tipo_original, substr(de,1,25) AS de, substr(cuerpo,1,250) AS msg FROM eventos WHERE timestamp >= datetime('now','-5 minutes') ORDER BY timestamp ASC LIMIT 30;"
