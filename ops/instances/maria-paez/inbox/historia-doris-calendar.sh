#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ Eventos calendar-watch con Doris (últimos 30 días) ═══"
sqlite3 -header -column "$DB" "
SELECT datetime(timestamp), substr(cuerpo,1,250) AS msg
FROM eventos
WHERE timestamp >= datetime('now','-30 days')
  AND (cuerpo LIKE '%Doris%' OR cuerpo LIKE '%doris%' OR cuerpo LIKE '%calendar-watch%')
  AND (cuerpo LIKE '%calendar%' OR cuerpo LIKE '%acceso%' OR cuerpo LIKE '%share%')
ORDER BY timestamp DESC LIMIT 30;
"

echo ""
echo "═══ Acciones set_calendar_acceso o actualizar_usuario para Doris ═══"
sqlite3 -header "$DB" "
SELECT datetime(timestamp), substr(cuerpo,1,200), substr(metadata_json,1,200)
FROM eventos
WHERE timestamp >= datetime('now','-30 days') AND canal='sistema'
  AND (cuerpo LIKE '%set_calendar_acceso%' OR cuerpo LIKE '%actualizar_usuario%')
  AND (cuerpo LIKE '%Doris%' OR cuerpo LIKE '%id=6%' OR metadata_json LIKE '%doris%' OR metadata_json LIKE '%\"id\":6%')
ORDER BY timestamp DESC LIMIT 20;
"

echo ""
echo "═══ ¿Doris está en el calendarList de Maria? (acceso real) ═══"
cd /root/secretaria && node -e "
(async () => {
  const g = require('./google');
  const cals = await g.listarCalendarios();
  console.log('Maria tiene', cals.length, 'calendars compartidos:');
  for (const c of cals) {
    console.log('  -', c.summary || c.id, '|', c.accessRole, '|', c.id);
  }
})();
" 2>&1
