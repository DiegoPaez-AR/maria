#!/bin/bash
set -uo pipefail
cd /root/secretaria
DB="$MARIA_DB"

echo "── ANTES ──"
sqlite3 -header "$DB" "SELECT id, nombre, wa_lid, wa_cus, calendar_id, calendar_acceso FROM usuarios WHERE id=13;"

echo
echo "── 1. UPDATE usuarios id=13 — wa_cus, calendar_id, calendar_acceso ──"
sqlite3 "$DB" "UPDATE usuarios SET wa_cus='5491166010010@c.us', calendar_id='santiago@capurro.com.ar', calendar_acceso='write' WHERE id=13;"
echo "  ✓ updated"

echo
echo "── 2. aceptarCalendarShare(santiago@capurro.com.ar) ──"
node -e "
const g = require('./google');
(async () => {
  const r = await g.aceptarCalendarShare('santiago@capurro.com.ar');
  console.log('aceptarCalendarShare:', JSON.stringify(r));
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
"

echo
echo "── DESPUÉS — usuario ──"
sqlite3 -header "$DB" "SELECT id, nombre, wa_lid, wa_cus, calendar_id, calendar_acceso FROM usuarios WHERE id=13;"

echo
echo "── listarCalendarios (¿aparece Santi?) ──"
node -e "
const g = require('./google');
(async () => {
  const cals = await g.listarCalendarios();
  for (const c of cals) {
    console.log(' ' + (c.primary?'★':' ') + ' ' + c.id + '  (' + c.accessRole + ')  — ' + (c.summary||''));
  }
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
"
