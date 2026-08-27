#!/bin/bash
cd /root/secretaria
echo "── hora ──"; date
HOY=$(date '+%Y-%m-%d')
echo "── errores de HOY ──"
timeout 20 grep "^$HOY" /root/.pm2/logs/maria-paez-error.log 2>/dev/null | tail -20
echo ""
echo "── conversación de Diego hoy a la mañana (TG) ──"
timeout 25 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
for r in db.execute("""SELECT timestamp,direccion,substr(cuerpo,1,160) c FROM eventos
   WHERE usuario_id=1 AND canal='telegram' AND timestamp >= datetime('now','-14 hours') ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else '←'
    print(f" {r['timestamp'][11:16]} {f} {(r['c'] or '').replace(chr(10),' | ')}")
print("\n── sistema hoy (fallos/acciones) ──")
for r in db.execute("""SELECT timestamp,substr(cuerpo,1,150) c FROM eventos
   WHERE canal='sistema' AND timestamp >= datetime('now','-14 hours')
     AND (cuerpo LIKE '%FALL%' OR cuerpo LIKE '%falló%' OR cuerpo LIKE '%no pude%' OR cuerpo LIKE '%error%') ORDER BY timestamp"""):
    print(f" {r['timestamp'][11:16]} {(r['c'] or '').replace(chr(10),' ')}")
db.close()
PY
echo "── ¿Poch respondió? ──"
timeout 15 grep -E "3764-6922|Poch" /root/.pm2/logs/maria-paez-out.log | tail -4
echo LISTO
