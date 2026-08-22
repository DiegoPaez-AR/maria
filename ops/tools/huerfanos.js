// Detector de helpers huérfanos: identificadores _foo( llamados pero nunca
// definidos en el mismo archivo. Barato y atrapa justo lo que el require-smoke
// y `node --check` NO ven: funciones borradas cuyo call site quedó vivo.
const fs = require('fs');
const archivos = process.argv.slice(2);
let malos = 0;
for (const f of archivos) {
  const src = fs.readFileSync(f, 'utf8');
  const defs = new Set();
  for (const m of src.matchAll(/(?:async\s+)?function\s+(_\w+)/g)) defs.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+(_\w+)\s*=/g)) defs.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g))
    for (const p of m[1].split(',')) { const n = p.split(':').pop().trim(); if (n.startsWith('_')) defs.add(n); }
  for (const m of src.matchAll(/(_\w+)\s*:/g)) defs.add(m[1]);          // props de objeto
  for (const m of src.matchAll(/\(\s*([^)]*)\)\s*=>/g))
    for (const p of m[1].split(',')) { const n = p.trim().split(/[=\s]/)[0]; if (n.startsWith('_')) defs.add(n); }
  for (const m of src.matchAll(/function\s*\w*\s*\(([^)]*)\)/g))
    for (const p of m[1].split(',')) { const n = p.trim().split(/[=\s]/)[0]; if (n.startsWith('_')) defs.add(n); }
  const usos = new Set([...src.matchAll(/(?<![.\w$])(_\w+)\s*\(/g)].map(m => m[1]));
  const h = [...usos].filter(u => !defs.has(u));
  if (h.length) { console.log(`HUÉRFANO en ${f}: ${h.join(', ')}`); malos += h.length; }
}
if (malos) { console.log(`\n${malos} helper(s) llamados pero nunca definidos`); process.exit(1); }
console.log('helpers huérfanos: ninguno ✓');
