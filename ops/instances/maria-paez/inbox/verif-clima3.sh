#!/bin/bash
cat > /tmp/_verif3.js <<'JS'
(async () => {
  try {
    const mem = require('/root/secretaria/memory');
    const dist = mem.db.prepare('SELECT ubicacion, COUNT(*) n FROM usuarios GROUP BY ubicacion').all();
    console.log('ubicaciones:', JSON.stringify(dist));
    const clima = require('/root/secretaria/clima');
    const g = await clima.geocodificar('Buenos Aires, AR');
    console.log('geo BA,AR:', JSON.stringify(g));
    if (g) {
      const pr = await clima.pronosticoHoy(g.lat, g.lon, 'America/Argentina/Buenos_Aires');
      console.log('pronostico:', JSON.stringify(pr));
    }
    const usuarios = require('/root/secretaria/usuarios');
    const mb = require('/root/secretaria/morning-brief');
    const d = usuarios.resolverPorNombre('Diego') || usuarios.listarActivos()[0];
    console.log('--- BRIEF ' + d.nombre + ' ---');
    console.log(await mb.componerBrief(d));
    console.log('--- FIN ---');
  } catch (e) { console.log('ERR', e.message); }
})();
JS
cd /root/secretaria && node /tmp/_verif3.js
