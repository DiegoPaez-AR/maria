#!/bin/bash
# Diagnóstico de contactos duplicados en TODAS las libretas. SOLO LECTURA.
# No imprime teléfonos/emails completos (el outbox va a git): muestra
# nombre + últimos 4 dígitos/dominio.
node - <<'NODE'
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB, { readonly: true });
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const digitos = s => String(s || '').replace(/\D/g, '');
const rows = db.prepare(`SELECT id, usuario_id, nombre, whatsapp, email, visibilidad, notas IS NOT NULL AND notas != '' AS tiene_notas, cumple, perfil_web IS NOT NULL AS tiene_perfil FROM contactos ORDER BY usuario_id, id`).all();
const usuarios = Object.fromEntries(db.prepare(`SELECT id, nombre FROM usuarios`).all().map(u => [u.id, u.nombre]));
console.log(`total contactos: ${rows.length}`);
const grupos = new Map(); // clave -> [rows]
for (const r of rows) {
  const scope = r.visibilidad === 'publica' ? 'PUB' : `u${r.usuario_id}`;
  const claves = [];
  if (r.email) claves.push(`${scope}|email|${norm(r.email)}`);
  const d = digitos(r.whatsapp);
  if (d.length >= 8) claves.push(`${scope}|tel|${d.slice(-10)}`); // sufijo 10 (banca 9-AR)
  claves.push(`${scope}|nombre|${norm(r.nombre)}`);
  for (const k of claves) {
    if (!grupos.has(k)) grupos.set(k, new Set());
    grupos.get(k).add(r.id);
  }
}
const porId = Object.fromEntries(rows.map(r => [r.id, r]));
const dupSets = new Map(); // firma del set -> {claves, ids}
for (const [k, ids] of grupos) {
  if (ids.size < 2) continue;
  const firma = [...ids].sort((a,b)=>a-b).join(',');
  if (!dupSets.has(firma)) dupSets.set(firma, { claves: [], ids: [...ids] });
  dupSets.get(firma).claves.push(k.split('|')[1]);
}
if (!dupSets.size) { console.log('SIN DUPLICADOS 🎉'); process.exit(0); }
console.log(`grupos duplicados: ${dupSets.size}\n`);
for (const [firma, g] of dupSets) {
  const ej = porId[g.ids[0]];
  const scope = ej.visibilidad === 'publica' ? 'PÚBLICA' : `libreta de ${usuarios[ej.usuario_id] || ej.usuario_id}`;
  console.log(`── [${g.claves.join('+')}] en ${scope} ──`);
  for (const id of g.ids) {
    const r = porId[id];
    const tel = digitos(r.whatsapp); 
    console.log(`  id=${id} "${r.nombre}" tel=${tel ? '…'+tel.slice(-4) : '—'} email=${r.email ? '…@'+String(r.email).split('@')[1] : '—'} vis=${r.visibilidad} notas=${r.tiene_notas?'sí':'no'} cumple=${r.cumple||'—'} perfil=${r.tiene_perfil?'sí':'no'}`);
  }
}
db.close();
NODE
echo LISTO
