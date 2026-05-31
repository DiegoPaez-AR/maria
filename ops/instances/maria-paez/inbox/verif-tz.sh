#!/bin/bash
cat > /tmp/_veriftz.js <<'JS'
(async () => {
  try {
    const clima = require('/root/secretaria/clima');
    for (const c of ['Madrid, ES', 'Rosario, AR', 'Buenos Aires, AR', 'Tokyo, JP']) {
      const g = await clima.geocodificar(c);
      console.log(c, '->', g ? `lat=${g.lat} lon=${g.lon} tz=${g.tz}` : 'null');
    }
  } catch (e) { console.log('ERR', e.message); }
})();
JS
cd /root/secretaria && node /tmp/_veriftz.js
