#!/bin/bash
node <<'NODE'
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, { readonly: true });
console.log('══ 1. OUTBOX: estados ══');
db.prepare(`SELECT estado, COUNT(*) c FROM wa_outbox GROUP BY estado`).all().forEach(r => console.log(' ', r.estado + ':', r.c));
db.prepare(`SELECT id, creado, estado, numero, substr(texto,1,50) t FROM wa_outbox WHERE estado != 'entregado' ORDER BY id`).all()
  .forEach(r => console.log('  ⚠️', r.id, r.creado, r.estado, r.numero, '|', String(r.t).replace(/\n/g, ' ')));
console.log('');
console.log('══ 2. HILOS CON ÚLTIMO MENSAJE ENTRANTE (sin responder, 36h, WA+TG) ══');
const hilos = db.prepare(`
  SELECT de, MAX(id) maxid FROM eventos
  WHERE canal IN ('whatsapp','telegram') AND direccion='entrante' AND timestamp >= datetime('now','-36 hours') AND de IS NOT NULL
  GROUP BY de`).all();
for (const h of hilos) {
  const digs = String(h.de).replace(/\D/g, '').slice(-9);
  if (!digs) continue;
  const ultimo = db.prepare(`
    SELECT id, timestamp, direccion, canal, substr(cuerpo,1,90) c FROM eventos
    WHERE canal IN ('whatsapp','telegram') AND (de LIKE '%'||?||'%' )
    ORDER BY id DESC LIMIT 1`).get(digs);
  const ultimoSaliente = db.prepare(`
    SELECT MAX(id) m FROM eventos WHERE direccion='saliente' AND canal IN ('whatsapp','telegram') AND de LIKE '%'||?||'%'`).get(digs);
  const outbox = db.prepare(`SELECT MAX(id) m, MAX(creado) ts FROM wa_outbox WHERE numero LIKE '%'||?||'%'`).get(digs.slice(-8));
  const entranteId = h.maxid;
  const entrante = db.prepare(`SELECT timestamp, substr(cuerpo,1,100) c FROM eventos WHERE id=?`).get(entranteId);
  // respondido si hay saliente (eventos u outbox) POSTERIOR al entrante
  const salTs = outbox.ts || '';
  const respondido = (ultimoSaliente.m && ultimoSaliente.m > entranteId) || (salTs && salTs > entrante.timestamp);
  if (!respondido) console.log('  🔴 SIN RESPONDER', h.de, '|', entrante.timestamp, '|', String(entrante.c).replace(/\n/g, ' '));
}
console.log('  (fin del barrido)');
console.log('');
console.log('══ 3. MENSAJE #23 a Hernán (22:03) + respuestas de Hernán después ══');
console.log('  #23:', db.prepare(`SELECT texto FROM wa_outbox WHERE id=23`).get().texto.replace(/\n/g, ' '));
db.prepare(`SELECT timestamp, substr(cuerpo,1,110) c FROM eventos WHERE de LIKE '%26829596%' AND direccion='entrante' AND timestamp >= '2026-08-14 22:00:00' ORDER BY id`).all()
  .forEach(r => console.log('  HERNÁN', r.timestamp, '|', String(r.c).replace(/\n/g, ' ')));
console.log('');
console.log('══ 4. PROGRAMADOS pendientes ══');
db.prepare(`SELECT id, cuando, destino, substr(texto,1,70) t, razon FROM programados WHERE enviado=0 ORDER BY cuando LIMIT 8`).all()
  .forEach(r => console.log(' ', r.id, r.cuando, '→', r.destino, '|', String(r.t).replace(/\n/g, ' ')));
db.close();
NODE
echo LISTO
