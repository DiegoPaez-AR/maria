#!/bin/bash
set +e
cd /root/secretaria || exit 1
cat > /tmp/dump-usuarios.js <<'JS'
const mem = require('/root/secretaria/memory');
const cols = mem.db.prepare("PRAGMA table_info(usuarios)").all().map(c=>c.name);
console.log('COLUMNAS ('+cols.length+'): '+cols.join(', '));
const rows = mem.db.prepare("SELECT * FROM usuarios ORDER BY id").all();
console.log('TOTAL FILAS: '+rows.length+'\n');
const mask = (k,v) => {
  if (v === null || v === undefined) return '∅';
  if (k === 'calendar_auth_json') return '<cifrado '+String(v).length+'b>';
  let s = String(v);
  if (s.length > 60) s = s.slice(0,57)+'…';
  return s;
};
for (const r of rows) {
  console.log('───────────────────────────────────────────');
  for (const k of cols) console.log('  '+k.padEnd(20)+': '+mask(k, r[k]));
}
JS
node /tmp/dump-usuarios.js 2>&1
rm -f /tmp/dump-usuarios.js
