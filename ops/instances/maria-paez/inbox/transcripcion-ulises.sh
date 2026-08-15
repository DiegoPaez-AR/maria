#!/bin/bash
node <<'NODE'
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, { readonly: true });
const entrantes = db.prepare(`
  SELECT timestamp AS ts, cuerpo AS txt FROM eventos
  WHERE canal='whatsapp' AND direccion='entrante' AND de LIKE '%41935177%'
`).all().map(r => ({ ...r, quien: 'ULISES' }));
const salientes = db.prepare(`
  SELECT creado AS ts, texto AS txt FROM wa_outbox WHERE numero LIKE '%41935177%'
`).all().map(r => ({ ...r, quien: 'MARIA' }));
const todo = [...entrantes, ...salientes].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
for (const m of todo) console.log(`[${String(m.ts).slice(11, 16)}] ${m.quien}: ${String(m.txt).replace(/\n/g, ' ')}\n`);
db.close();
NODE
echo LISTO
