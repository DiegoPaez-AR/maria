#!/bin/bash
# Diagnóstico Doris parte 2 — reproducir componerBrief y capturar stack completo.
set -u
cd /root/secretaria

# Cargar env del .conf (la app lo necesita para encontrar la DB, tokens, etc.)
set -a; source config/instances/maria-paez.conf; set +a

cat > /tmp/diag-doris.js <<'JS'
(async () => {
  try {
    const usuarios = require('/root/secretaria/usuarios.js');
    const mb = require('/root/secretaria/morning-brief.js');
    const g = require('/root/secretaria/google.js');

    const activos = usuarios.listarActivos();
    const doris = activos.find(u => /Doris/i.test(u.nombre));
    if (!doris) { console.log('no encontré a Doris en listarActivos()'); process.exit(0); }

    console.log('═══ Doris desde listarActivos() ═══');
    console.log(JSON.stringify(doris, null, 2));

    console.log('\n═══ Probando g.listarEventosDelUsuario(doris) ═══');
    try {
      const evs = await g.listarEventosDelUsuario(doris, { dias: 1, max: 20 });
      console.log('OK, eventos:', evs.length);
      if (evs.length) console.log(JSON.stringify(evs[0], null, 2).slice(0, 500));
    } catch (e) {
      console.log('FAIL listarEventosDelUsuario:');
      console.log('  message:', JSON.stringify(e.message));
      console.log('  stack:', e.stack);
      console.log('  keys:', Object.getOwnPropertyNames(e).join(','));
    }

    console.log('\n═══ Probando mb.componerBrief(doris) ═══');
    try {
      const texto = await mb.componerBrief(doris);
      console.log('OK texto generado, len=', texto.length);
      console.log('---primeras 500 chars---');
      console.log(texto.slice(0, 500));
    } catch (e) {
      console.log('FAIL componerBrief:');
      console.log('  message:', JSON.stringify(e.message));
      console.log('  stack:', e.stack);
      console.log('  keys:', Object.getOwnPropertyNames(e).join(','));
      try { console.log('  full JSON:', JSON.stringify(e, Object.getOwnPropertyNames(e))); } catch(_) {}
    }

    console.log('\n═══ Probar también con un usuario que SÍ funciona (Fernando Boero, id=4) ═══');
    const fer = activos.find(u => u.id === 4);
    if (fer) {
      try {
        const texto = await mb.componerBrief(fer);
        console.log('Fernando OK, texto len=', texto.length);
      } catch (e) {
        console.log('Fernando FAIL:', e.message);
      }
    }

    process.exit(0);
  } catch (top) {
    console.error('TOP ERROR:', top.stack || top);
    process.exit(1);
  }
})();
JS

node /tmp/diag-doris.js
