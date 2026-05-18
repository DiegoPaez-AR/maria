#!/bin/bash
set +e
cd /root/secretaria && node -e "
(async () => {
  const usuarios = require('./usuarios');
  const mb = require('./morning-brief');
  const doris = usuarios.obtener(6);
  console.log('Doris:', doris.nombre, 'calendar:', doris.calendar_id, doris.calendar_acceso);

  // Necesitamos el waClient del proceso pm2 — pero este script corre standalone.
  // Componemos el brief y lo mandamos via google email (no WA) como fallback,
  // o intentamos importar el client desde el proceso pm2 (no se puede).
  //
  // Approach pragmático: componer el brief y mostrar el texto. Para enviarlo
  // por WA hay que esperar al loop natural (mañana 7am en su TZ) o reiniciar
  // pm2 forzando el ciclo.

  const texto = await mb.componerBrief(doris);
  console.log('═══ TEXTO DEL BRIEF (que se mandaría a Doris) ═══');
  console.log(texto);
})().catch(err => console.error('FALLO:', err.message));
" 2>&1
