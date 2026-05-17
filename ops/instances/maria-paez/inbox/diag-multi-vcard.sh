#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ tipo_original distintos en últimos 30 días (canal=whatsapp) ═══"
sqlite3 -header -column "$DB" "SELECT tipo_original, COUNT(*) AS n FROM eventos WHERE canal='whatsapp' AND timestamp >= datetime('now','-30 days') GROUP BY tipo_original ORDER BY n DESC;"

echo ""
echo "═══ Eventos con tipo_original vcard/multi_vcard en últimos 30 días ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), direccion, substr(de,1,28) AS de, tipo_original, substr(cuerpo,1,150) AS msg FROM eventos WHERE canal='whatsapp' AND tipo_original LIKE '%vcard%' AND timestamp >= datetime('now','-30 days') ORDER BY timestamp DESC LIMIT 30;"

echo ""
echo "═══ Eventos sistema con cuerpo 'contacto vcard' (lo que loggea el handler) ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), substr(cuerpo,1,200) AS msg FROM eventos WHERE canal='sistema' AND cuerpo LIKE '%contacto vcard%' AND timestamp >= datetime('now','-30 days') ORDER BY timestamp DESC LIMIT 20;"

echo ""
echo "═══ pm2 logs últimas 5000 — menciones de vcard, multi_vcard, vCards ═══"
pm2 logs maria-paez --lines 5000 --nostream 2>&1 | grep -iE "vcard|multi_vcard|vCards|FN:|TEL:" | tail -30
