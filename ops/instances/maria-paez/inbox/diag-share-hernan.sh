#!/bin/bash
set -uo pipefail
cd /root/secretaria
cf=config/instances/maria-paez.conf
set -a; . "$cf"; set +a
DB="$MARIA_DB"

echo "=== calendar_acceso de Hernan (user 2) AHORA ==="
sqlite3 -header -column "$DB" "SELECT id,nombre,calendar_id,calendar_provider,calendar_acceso FROM usuarios WHERE id=2;"

echo ""
echo "=== conv con Hernan ultima hora (ART) ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, direccion, COALESCE(json_extract(metadata_json,'\$.slot'),'') slot, replace(substr(COALESCE(cuerpo,''),1,180),char(10),' / ') t FROM eventos WHERE canal='whatsapp' AND de LIKE '%26829596%' AND timestamp >= '2026-05-29 14:00:00' ORDER BY timestamp;"

echo ""
echo "=== eventos sistema/interno de user 2 ultima hora (set_calendar_acceso etc) ==="
sqlite3 "$DB" "SELECT datetime(timestamp,'-3 hours') art, canal, replace(substr(COALESCE(cuerpo,''),1,160),char(10),' / ') t FROM eventos WHERE usuario_id=2 AND canal IN ('sistema','calendar') AND timestamp >= '2026-05-29 13:30:00' ORDER BY timestamp;"

echo ""
echo "=== logs pm2: share/calendar/Hernan/error ultimas lineas ==="
tail -120 /root/.pm2/logs/maria-paez-out.log 2>/dev/null | grep -iE "share|calendarList|set_calendar|acceso|hernan|sondeos|aceptar|invitación|compart" | tail -15

echo ""
echo "=== READ-ONLY: el calendar de Hernan ya esta en el calendarList de Maria? ==="
node -e "
const g=require('./google');
(async()=>{
  try {
    const cals = await g.listarCalendarios();
    const hit = cals.find(c => (c.id||'').toLowerCase().includes('hernan') || (c.id||'').toLowerCase().includes('sondeos'));
    console.log('total cals en calendarList:', cals.length);
    console.log('calendar de Hernan presente?:', hit ? (hit.id+' role='+hit.accessRole) : 'NO esta');
    const acc = await g.chequearAccesoCalendar('hernan.fulco@sondeosglobal.com');
    console.log('chequearAccesoCalendar(hernan.fulco@sondeosglobal.com) ->', acc);
  } catch(e){ console.log('ERR:', e.message); }
})();
"
