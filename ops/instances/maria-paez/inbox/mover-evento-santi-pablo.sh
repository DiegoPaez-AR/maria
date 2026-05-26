#!/bin/bash
set -uo pipefail
cd /root/secretaria
node -e "
const g = require('./google');
(async () => {
  // 1. Buscar el evento en el calendar de Diego
  console.log('── 1. listar eventos en calendar de Diego (próximos 7 días) ──');
  const evs = await g.listarEventosProximos({ calendarId: 'diego@paez.is', dias: 7, max: 50 });
  const target = evs.find(e => /Almuerzo.*Santi.*Pablo|Santi.*Pablo.*almuerzo/i.test(e.summary || ''));
  if (!target) {
    console.error('No encontré el evento \"Almuerzo Santi - Pablo\" en calendar de Diego.');
    console.error('Eventos vistos:', evs.map(e => e.summary).join(' | '));
    process.exit(1);
  }
  console.log('  ✓ encontrado:', target.id, '-', target.summary, '@', target.start, '→', target.end);

  // 2. Borrar el evento (Google manda email de cancel a attendees)
  console.log('');
  console.log('── 2. borrar evento del calendar de Diego (sendUpdates=all) ──');
  await g.borrarEvento({ id: target.id, calendarId: 'diego@paez.is' });
  console.log('  ✓ borrado');

  // 3. Crear evento nuevo en calendar de Santi (santiago@capurro.com.ar)
  //    attendees: solo Pablo (Santi es dueño del calendar, va implícito)
  console.log('');
  console.log('── 3. crear evento en calendar de Santi ──');
  const nuevo = await g.crearEvento({
    summary: target.summary,
    start: target.start,
    end: target.end,
    descripcion: target.description || '',
    ubicacion: target.location || '',
    attendees: ['pablo@capurro.com.ar'],
    calendarId: 'santiago@capurro.com.ar',
    meet: false,
  });
  console.log('  ✓ creado:', nuevo.id, '-', nuevo.summary, '@', nuevo.start);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
"
