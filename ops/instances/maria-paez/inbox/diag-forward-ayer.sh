#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Eventos sistema con reenviar_wa/forward en últimos 3 días ═══"
sqlite3 -header -column "$DB" "SELECT datetime(timestamp), direccion, substr(cuerpo,1,250) AS msg FROM eventos WHERE timestamp >= datetime('now','-3 days') AND (cuerpo LIKE '%reenviar_wa%' OR cuerpo LIKE '%forward%') ORDER BY timestamp ASC LIMIT 30;"

echo ""
echo "═══ Mensajes con menciones de presupuesto/cotización/auto en últimos 3 días — owner ═══"
sqlite3 -header "$DB" "SELECT datetime(timestamp), direccion, canal, substr(de,1,25) AS de, substr(cuerpo,1,200) AS msg FROM eventos WHERE timestamp >= datetime('now','-3 days') AND (cuerpo LIKE '%presupuesto%' OR cuerpo LIKE '%cotizaci%' OR cuerpo LIKE '%pasame%' OR cuerpo LIKE '%pasale%' OR cuerpo LIKE '%mandale el%' OR cuerpo LIKE '%reenvi%' OR cuerpo LIKE '%forward%') ORDER BY timestamp ASC LIMIT 60;"

echo ""
echo "═══ pm2 logs ayer/hoy — reenviar_wa específicamente ═══"
pm2 logs maria-paez --lines 5000 --nostream 2>&1 | grep -iE "reenviar_wa|reenviarWA|forward|getMessageById" | tail -50

echo ""
echo "═══ pm2 logs — fallos en acciones (puede incluir reenviar_wa) ═══"
pm2 logs maria-paez --lines 5000 --nostream 2>&1 | grep -iE "acción.*falló.*reenviar|acción #.*reenviar|FALLARON.*reenviar" | tail -30
