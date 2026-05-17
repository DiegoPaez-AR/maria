#!/bin/bash
set +e
echo "═══ pm2 logs RAW últimas 80 lineas (sin filtro) ═══"
pm2 logs maria-paez --lines 80 --nostream 2>&1 | tail -75

echo ""
echo "═══ Mensajes entrantes a Maria últimas 15 min (cualquier canal) ═══"
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), canal, direccion, tipo_original, substr(de,1,30) AS de, LENGTH(cuerpo) AS body_len, substr(cuerpo,1,80) AS body FROM eventos WHERE timestamp >= datetime('now','-15 minutes') ORDER BY timestamp ASC;"
