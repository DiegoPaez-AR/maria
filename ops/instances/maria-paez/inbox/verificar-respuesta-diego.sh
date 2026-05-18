#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Últimos 12 eventos WA (entrante/saliente) últimos 10 min ═══"
sqlite3 -header -column "$DB" "
SELECT datetime(timestamp), direccion, substr(de,1,28) AS de, substr(cuerpo,1,140) AS msg
FROM eventos WHERE canal='whatsapp' AND timestamp >= datetime('now','-10 minutes')
ORDER BY timestamp DESC LIMIT 12;
"

echo ""
echo "═══ pm2 logs últimas 25 lineas ═══"
pm2 logs maria-paez --lines 30 --nostream 2>&1 | tail -22

echo ""
echo "═══ Estado claude_call más reciente ═══"
sqlite3 -header -column "$DB" "
SELECT datetime(timestamp), substr(cuerpo, 1, 200)
FROM eventos WHERE canal='sistema' AND cuerpo LIKE 'claude_call%'
  AND timestamp >= datetime('now','-15 minutes')
ORDER BY timestamp DESC LIMIT 5;
"
