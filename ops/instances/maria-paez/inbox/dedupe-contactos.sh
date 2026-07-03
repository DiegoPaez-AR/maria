#!/bin/bash
# Merge de contactos duplicados (autorizado por Diego 2026-07-03).
# Backup de la DB primero. Merges LOSSLESS: datos divergentes van a notas.
cd /root/secretaria
python3 - "$MARIA_DB" /root/backups/pre-dedupe-$(date +%Y%m%d).sqlite <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2])
src.backup(dst); dst.close(); src.close()
print(f"backup pre-dedupe OK → {sys.argv[2]}")
PY
node - <<'NODE'
const db = require('/root/secretaria/node_modules/better-sqlite3')(process.env.MARIA_DB);
// [keepId, dropId] — decididos en el diagnóstico (outbox/diag-contactos-dup.out)
const PARES = [
  [38, 40],    // Narda Comedor ← número crudo
  [73, 70],    // Rubén Ward (rica: notas+cumple) ← Ruben Ward (tel/email alternativos)
  [275, 97],   // Guillermo Bagnato (tel) ← Guillermo (TQA) (notas; mismo email)
  [112, 114],  // Hernán Arcidiacono (email+notas) ← Hernan (tel)
  [230, 231],  // Damián Maldini (email+notas) ← Damian (tel)
];
const get = db.prepare(`SELECT * FROM contactos WHERE id=?`);
const digitos = s => String(s || '').replace(/\D/g, '');
const tx = db.transaction(() => {
  for (const [keepId, dropId] of PARES) {
    const k = get.get(keepId), d = get.get(dropId);
    if (!k || !d) { console.log(`SKIP ${keepId}←${dropId}: alguno no existe`); continue; }
    const set = {}, extraNotas = [];
    for (const campo of ['whatsapp', 'email', 'cumple', 'perfil_web']) {
      if (!k[campo] && d[campo]) set[campo] = d[campo];
      else if (k[campo] && d[campo] && campo === 'whatsapp' && digitos(k[campo]).slice(-10) !== digitos(d[campo]).slice(-10)) extraNotas.push(`tel alternativo: ${d[campo]}`);
      else if (k[campo] && d[campo] && campo === 'email' && String(k[campo]).toLowerCase() !== String(d[campo]).toLowerCase()) extraNotas.push(`email alternativo: ${d[campo]}`);
    }
    let notas = k.notas || '';
    if (d.notas && d.notas !== k.notas) notas = notas ? `${notas} | ${d.notas}` : d.notas;
    if (extraNotas.length) notas = notas ? `${notas} | ${extraNotas.join(' | ')}` : extraNotas.join(' | ');
    if (notas !== (k.notas || '')) set.notas = notas;
    const setSql = Object.keys(set).map(c => `${c}=@${c}`).join(', ');
    if (setSql) db.prepare(`UPDATE contactos SET ${setSql} WHERE id=@id`).run({ ...set, id: keepId });
    // notas curadas: re-apuntar (si el keep ya tiene, mergear texto)
    const notaDrop = db.prepare(`SELECT * FROM notas_contacto WHERE contacto_id=?`).get(dropId);
    if (notaDrop) {
      const notaKeep = db.prepare(`SELECT * FROM notas_contacto WHERE contacto_id=? AND usuario_id=?`).get(keepId, notaDrop.usuario_id);
      if (notaKeep) {
        db.prepare(`UPDATE notas_contacto SET nota = nota || ' | ' || ? WHERE id=?`).run(notaDrop.nota, notaKeep.id);
        db.prepare(`DELETE FROM notas_contacto WHERE id=?`).run(notaDrop.id);
      } else {
        db.prepare(`UPDATE notas_contacto SET contacto_id=? WHERE id=?`).run(keepId, notaDrop.id);
      }
    }
    db.prepare(`DELETE FROM contactos WHERE id=?`).run(dropId);
    console.log(`MERGE ${dropId} → ${keepId} ("${k.nombre}")${Object.keys(set).length ? ' campos: ' + Object.keys(set).join(',') : ''}`);
  }
});
tx();
// log al historial del owner
const ev = db.prepare(`INSERT INTO eventos (usuario_id, canal, direccion, cuerpo, metadata_json, tipo) VALUES (1, 'sistema', 'interno', ?, ?, 'dedupe_contactos')`);
ev.run('dedupe de contactos: 5 merges (Narda, Rubén Ward, Guillermo Bagnato, Hernán Arcidiacono, Damián Maldini). Backup pre-dedupe en /root/backups/. Caso Claudio Cid/Laura Acera (tel compartido) pendiente de decisión de Diego.', JSON.stringify({ tipo: 'dedupe_contactos', pares: PARES }));
console.log('log en eventos OK');
db.close();
NODE
echo LISTO
