#!/bin/bash
set +e
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"

echo "═══ ANTES ═══"
sqlite3 -header -column "$DB" "SELECT id, nombre, calendar_id, calendar_acceso, calendar_provider FROM usuarios WHERE id=6;"

echo ""
echo "═══ UPDATE: setear calendar_id + calendar_acceso (Maria tiene reader access verificado) ═══"
sqlite3 "$DB" "UPDATE usuarios SET calendar_id='doris@capurro.com.ar', calendar_acceso='read', actualizado=CURRENT_TIMESTAMP WHERE id=6; SELECT 'changes='||changes();"

echo ""
echo "═══ DESPUÉS ═══"
sqlite3 -header -column "$DB" "SELECT id, nombre, calendar_id, calendar_acceso, datetime(actualizado) FROM usuarios WHERE id=6;"

echo ""
echo "═══ Smoke: ahora Maria ve eventos de Doris? ═══"
cd /root/secretaria && node -e "
(async () => {
  const usuarios = require('./usuarios');
  const providers = require('./providers');
  const doris = usuarios.obtener(6);
  console.log('Doris ahora:', doris.calendar_id, doris.calendar_acceso);
  const p = await providers.forUser(doris);
  const eventos = await p.listarEventosDelUsuario(doris, { dias: 14 });
  console.log('eventos próximos 14d:', eventos.length);
  for (const e of eventos.slice(0, 8)) console.log('  -', e.start, '-', (e.summary || '(sin título)').slice(0,60));
})();
" 2>&1
