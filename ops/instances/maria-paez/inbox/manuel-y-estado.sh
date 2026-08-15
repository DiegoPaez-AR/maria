#!/bin/bash
node <<'NODE'
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, { readonly: true });
console.log('══ CONVERSACIÓN CON MANUEL ══');
const entr = db.prepare(`SELECT timestamp AS ts, cuerpo AS txt FROM eventos WHERE canal='whatsapp' AND direccion='entrante' AND de LIKE '%55771290%'`).all().map(r => ({ ...r, quien: 'MANUEL' }));
const sal = db.prepare(`SELECT creado AS ts, texto AS txt, estado FROM wa_outbox WHERE numero LIKE '%55771290%'`).all().map(r => ({ ...r, quien: 'MARIA(' + r.estado + ')' }));
[...entr, ...sal].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  .forEach(m => console.log(`[${String(m.ts).slice(5, 16)}] ${m.quien}: ${String(m.txt).replace(/\n/g, ' ')}\n`));
console.log('══ ÚLTIMAS FILAS DEL OUTBOX (estado de las pruebas) ══');
db.prepare(`SELECT id, creado, tomado_en, estado, intentos, numero, substr(texto,1,45) t FROM wa_outbox WHERE id >= 24 ORDER BY id`).all()
  .forEach(r => console.log(r.id, r.creado, '→ tomado:', r.tomado_en || '-', r.estado, 'int:' + r.intentos, '|', r.numero, '|', String(r.t).replace(/\n/g, ' ')));
db.close();
NODE
echo LISTO
