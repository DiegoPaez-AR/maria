#!/bin/bash
cd /root/secretaria
timeout 40 python3 - <<'PY'
import sqlite3,os
db=sqlite3.connect(os.environ['MARIA_DB']); db.row_factory=sqlite3.Row
print("── TODO lo de Ward/Dimitrije desde el 26/8 ──")
for r in db.execute("""SELECT timestamp,canal,direccion,substr(cuerpo,1,200) c FROM eventos
   WHERE timestamp >= '2026-08-26' AND (cuerpo LIKE '%Ward%' OR cuerpo LIKE '%Dimitri%' OR cuerpo LIKE '%ruben.ward%')
   ORDER BY timestamp"""):
    f='→' if r['direccion']=='entrante' else ('←' if r['direccion']=='saliente' else '·')
    print(f" {r['timestamp'][5:16]} {r['canal'][:4]} {f} {(r['c'] or '').replace(chr(10),' | ')[:190]}")
print("\n── follow-ups y pendientes de esa gestión ──")
uid=db.execute("SELECT id FROM usuarios WHERE nombre='Hernan Fulco'").fetchone()[0]
for r in db.execute("SELECT id,descripcion,esperando_de,estado,vence_en,cerrado_en FROM follow_ups WHERE usuario_id=? ORDER BY id DESC LIMIT 5",(uid,)):
    print('  FU',dict(r))
for r in db.execute("SELECT id,desc,dueno,estado,creado FROM pendientes WHERE usuario_id=? ORDER BY id DESC LIMIT 6",(uid,)):
    print('  P ',dict(r))
db.close()
PY
echo LISTO
