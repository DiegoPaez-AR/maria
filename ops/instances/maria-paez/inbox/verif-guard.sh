#!/bin/bash
cd /root/secretaria
echo "── canary ──"; cat state/.canary-bad-commit 2>/dev/null && echo "⚠️ MALO" || echo "limpio ✓"
echo "── descartes por identidad ──"
timeout 25 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,140) c FROM eventos
   WHERE canal='sistema' AND cuerpo LIKE '%identidad no verificable%' ORDER BY timestamp DESC LIMIT 8"""):
    print(' ',r['timestamp'],'|',r['c'])
print(" ── Fico en libreta? ──")
for r in db.execute("SELECT id,usuario_id,nombre,whatsapp FROM contactos WHERE lower(nombre) LIKE '%fico%'"):
    print('  ',dict(r))
db.close()
PY
echo "── simulacro con el guard nuevo ──"
timeout 40 node -e "
require('/root/secretaria/wa-hook').procesar({query:{sender:'Fico restaurante', message:'(prueba interna, ignorar)'}})
 .then(r=>console.log('  ruteado:', JSON.stringify(r).slice(0,150)))
 .catch(e=>console.log('  err:', e.message));" 2>&1 | tail -4
echo LISTO
