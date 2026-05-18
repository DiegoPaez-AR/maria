#!/bin/bash
# Audit retroactivo: para cada usuario con calendar_acceso=none pero email
# que matchee con un calendar en el calendarList de Maria → fix DB.
# También dispara brief de Doris manualmente.
set +e

echo "═══ Audit + fix de shares pre-auto-accept ═══"
cd /root/secretaria && node -e "
(async () => {
  const usuarios = require('./usuarios');
  const g = require('./google');
  const mem = require('./memory');

  const cals = await g.listarCalendarios();
  const mapByEmail = {};
  for (const c of cals) {
    if (c.id && c.id.includes('@')) mapByEmail[c.id.toLowerCase()] = c;
  }

  console.log('Maria tiene', Object.keys(mapByEmail).length, 'calendars en su lista');
  console.log('');

  const list = usuarios.listarActivos();
  let arreglados = 0;
  for (const u of list) {
    if (!u.email) continue;
    if (u.calendar_acceso && u.calendar_acceso !== 'none') continue;
    const cal = mapByEmail[u.email.toLowerCase()];
    if (!cal) continue;
    const role = cal.accessRole;
    let tier = 'none';
    if (role === 'writer' || role === 'owner') tier = 'write';
    else if (role === 'reader' || role === 'freeBusyReader') tier = 'read';
    if (tier === 'none') continue;
    console.log(\`  → \${u.nombre} (\${u.email}): calendar_acceso=none pero Maria tiene \${role} → fix a \${tier}\`);
    usuarios.actualizar(u.id, { calendar_id: u.calendar_id || u.email.toLowerCase() });
    usuarios.setearCalendarAcceso(u.id, tier);
    mem.log({
      usuarioId: u.id,
      canal: 'sistema', direccion: 'interno',
      cuerpo: \`audit retroactivo: calendar_acceso \${u.email} → \${tier} (role=\${role})\`,
      metadata: { calendarId: u.email.toLowerCase(), role, tier, fuente: 'audit-retroactivo' },
    });
    arreglados++;
  }
  console.log('');
  console.log('Total arreglados:', arreglados);
})();
" 2>&1

echo ""
echo "═══ Estado final calendar de todos los users ═══"
DB="/root/secretaria/state/maria-paez/db/maria.sqlite"
sqlite3 -header -column "$DB" "SELECT id, nombre, email, calendar_id, calendar_acceso FROM usuarios WHERE activo=1 ORDER BY id;"

echo ""
echo "═══ Disparar morning-brief manual para Doris (id=6) ═══"
cd /root/secretaria && node -e "
(async () => {
  const mem = require('./memory');
  const usuarios = require('./usuarios');
  const mb = require('./morning-brief');
  const doris = usuarios.obtener(6);
  if (!doris) { console.log('Doris no encontrada'); return; }
  // Resetear el estado para que mb la mande de nuevo hoy
  mem.setEstadoUsuario(doris.id, 'morning_brief_ultimo_dia', null);
  console.log('estado reseteado, disparando...');
  // Importar el client de pm2 process — no podemos, así que usamos directamente la función
  // Mejor: invocar el dispatcher externo
})();
" 2>&1

echo ""
echo "═══ También trigger via mensaje al user (dispatch directo) ═══"
cd /root/secretaria && node -e "
(async () => {
  const mb = require('./morning-brief');
  console.log('exports morning-brief:', Object.keys(mb));
})();
" 2>&1
